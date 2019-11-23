/* tslint:disable:max-line-length no-empty */
import './mocks/core-container';

import { app } from '@arkecosystem/core-container';
import { State } from '@arkecosystem/core-interfaces';
import { Handlers } from '@arkecosystem/core-transactions';
import {
    Constants, Crypto, Errors, Identities, Managers, Transactions, Utils
} from '@arkecosystem/crypto';
import { configManager } from '@arkecosystem/crypto/dist/managers';
import { Builders as StakeBuilders } from '@nosplatform/stake-transactions-crypto/src';

import { WalletManager } from '../../../packages/core-state/src/wallets';
import {
    StakeNotFoundError, StakeNotIntegerError, StakeNotYetRedeemableError, StakeTimestampError
} from '../src/errors';
import { StakeCreateTransactionHandler, StakeRedeemTransactionHandler } from '../src/handlers';
import { ExpireHelper } from '../src/helpers';
import { Stake } from '@nosplatform/storage';

beforeAll(() => {
    Managers.configManager.setFromPreset("testnet");
    Managers.configManager.setHeight(1);
    Handlers.Registry.registerTransactionHandler(StakeCreateTransactionHandler);
    Handlers.Registry.registerTransactionHandler(StakeRedeemTransactionHandler);
});

const ARKTOSHI = Constants.ARKTOSHI;
let stakeAmount;
let voterKeys;
let voter;
let initialBalance;
let stakeCreateHandler;
let stakeRedeemHandler;

let walletManager: State.IWalletManager;

beforeEach(() => {
    walletManager = new WalletManager();
    stakeAmount = Utils.BigNumber.make(10_000 * ARKTOSHI);
    voterKeys = Identities.Keys.fromPassphrase("secret");
    voter = walletManager.findByPublicKey(voterKeys.publicKey);
    voter.balance = stakeAmount.times(10);
    initialBalance = voter.balance;
    // voter.nonce = Utils.BigNumber.ZERO;
    stakeCreateHandler = new StakeCreateTransactionHandler();
    stakeRedeemHandler = new StakeRedeemTransactionHandler();

});

describe("Staking Transactions", () => {

    it("should throw if redeeming stake too soon", async () => {
        const store = app.resolvePlugin<State.IStateService>("state").getStore();

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: { timestamp: 1234567890 },
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567890);

        const stakeBuilder = new StakeBuilders.StakeCreateBuilder;
        const stakeTransaction = stakeBuilder
            .stakeAsset(7889400, stakeAmount)
            .nonce(voter.nonce.plus(1)).sign("secret")
            .build();

        await walletManager.applyTransaction(stakeTransaction);

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: {
                timestamp: voter.getAttribute("stakes")[stakeTransaction.id].redeemableTimestamp - 10,
            },
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(
            voter.getAttribute("stakes")[stakeTransaction.id].redeemableTimestamp - 10,
        );

        const redeemBuilder = new StakeBuilders.StakeRedeemBuilder;
        const stakeRedeemTransaction = redeemBuilder
            .stakeAsset(stakeTransaction.id)
            .nonce(voter.nonce.plus(1))
            .sign("secret");

        await expect(
            stakeRedeemHandler.throwIfCannotBeApplied(stakeRedeemTransaction.build(), voter, walletManager),
        ).rejects.toThrowError(StakeNotYetRedeemableError);

    });

    it("should throw if redeeming non-existent stake", async () => {
        const redeemBuilder = new StakeBuilders.StakeRedeemBuilder;
        const stakeRedeemTransaction = redeemBuilder
            .stakeAsset("3637383930363738393036373839303637383930363738393036373839301234")
            .nonce(voter.nonce.plus(1)).sign("secret");

        await expect(
            stakeRedeemHandler.throwIfCannotBeApplied(stakeRedeemTransaction.build(), voter, walletManager),
        ).rejects.toThrowError(StakeNotFoundError);
    });

    it("should throw if user stakes more than balance", async () => {
        voter.balance = stakeAmount.minus(1_000 * ARKTOSHI);

        const stakeBuilder = new StakeBuilders.StakeCreateBuilder;
        const stakeTransaction = stakeBuilder
            .stakeAsset(7889400, stakeAmount)
            .nonce(voter.nonce.plus(1)).sign("secret")
            .build();

        try {
            await walletManager.applyTransaction(stakeTransaction);
            expect(undefined).toBe("this should have resulted in an error");
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain("Not enough balance.");
        }
    });


    it("should throw if user stakes less than milestone-set minimum", async () => {
        const stakeBuilder = new StakeBuilders.StakeCreateBuilder;
        try {
            stakeBuilder
                .stakeAsset(7889400, Utils.BigNumber.ONE)
                .nonce(voter.nonce.plus(1)).sign("secret")
                .build();
            fail('This should\'ve resulted in an error');
        } catch (error) {
            expect(error).toBeInstanceOf(Errors.TransactionSchemaError);
        }

    });

    it("should throw on invalid stake timestamp", async () => {
        const store = app.resolvePlugin<State.IStateService>("state").getStore();

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: { timestamp: 1234567890 },
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234568011);

        const stakeBuilder = new StakeBuilders.StakeCreateBuilder;
        const stakeTransaction = stakeBuilder
            .stakeAsset(7889400, stakeAmount)
            .nonce(voter.nonce.plus(1)).sign("secret")
            .build();

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567890);

        await expect(
            stakeCreateHandler.throwIfCannotBeApplied(stakeTransaction, voter, walletManager),
        ).rejects.toThrowError(StakeTimestampError);
    });

    it("should throw if stake is fractional", async () => {
        const delegateKeys = Identities.Keys.fromPassphrase("delegate");
        const delegateWallet = walletManager.findByPublicKey(delegateKeys.publicKey);
        delegateWallet.setAttribute("delegate.username", "unittest");
        delegateWallet.balance = Utils.BigNumber.make(5000);
        delegateWallet.setAttribute("vote", delegateWallet.publicKey);
        delegateWallet.setAttribute<Utils.BigNumber>("delegate.voteBalance", delegateWallet.balance);
        walletManager.reindex(delegateWallet);

        stakeAmount = stakeAmount.plus(6);

        const stakeBuilder = new StakeBuilders.StakeCreateBuilder;
        const stakeTransaction = stakeBuilder
            .stakeAsset(15778800, stakeAmount)
            .nonce(voter.nonce.plus(1)).sign("secret")
            .build();

        await expect(
            stakeCreateHandler.throwIfCannotBeApplied(stakeTransaction, voter, walletManager),
        ).rejects.toThrowError(StakeNotIntegerError);
    });

    it("should vote then update vote balance after 6m stake", async () => {
        const delegateKeys = Identities.Keys.fromPassphrase("delegate");
        const delegateWallet = walletManager.findByPublicKey(delegateKeys.publicKey);
        delegateWallet.setAttribute("delegate.username", "unittest");
        delegateWallet.balance = Utils.BigNumber.make(5000);
        delegateWallet.setAttribute("vote", delegateWallet.publicKey);
        delegateWallet.setAttribute<Utils.BigNumber>("delegate.voteBalance", delegateWallet.balance);
        walletManager.reindex(delegateWallet);

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);

        const voteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`+${delegateKeys.publicKey}`])
            .nonce(voter.nonce.plus(1)).sign("secret")
            .build();

        await walletManager.applyTransaction(voteTransaction);

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance.plus(voter.balance));
        const stakeBuilder = new StakeBuilders.StakeCreateBuilder;
        const stakeTransaction = stakeBuilder
            .stakeAsset(15778800, stakeAmount)
            .nonce(voter.nonce.plus(1))
            .sign("secret")
            .build();

        await walletManager.applyTransaction(stakeTransaction).catch(error => {
            fail(error);
        });

        expect(voter.getAttribute("stakeWeight")).toEqual(stakeAmount.times(configManager.getMilestone().stakeLevels['15778800']).dividedBy(10));


        walletManager.reindex(delegateWallet);

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegateWallet.balance
                .plus(voter.balance)
                .plus(voter.getAttribute("stakeWeight")),
        );
    });

    it("should stake and then correctly update vote balances with vote and unvote create and reversal", async () => {
        const delegateKeys = Identities.Keys.fromPassphrase("delegate");
        const delegateWallet = walletManager.findByPublicKey(delegateKeys.publicKey);
        delegateWallet.setAttribute("delegate.username", "unittest");
        delegateWallet.balance = Utils.BigNumber.make(5000);
        delegateWallet.setAttribute("vote", delegateWallet.publicKey);
        delegateWallet.setAttribute<Utils.BigNumber>("delegate.voteBalance", delegateWallet.balance);
        walletManager.reindex(delegateWallet);

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567890);

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);

        const voteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`+${delegateKeys.publicKey}`])
            .nonce("1").sign("secret")
            .build();

        await walletManager.applyTransaction(voteTransaction);

        expect(voter.getAttribute("stakeWeight", Utils.BigNumber.ZERO)).toEqual(Utils.BigNumber.ZERO);
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance.plus(voter.balance));

        const stakeBuilder = new StakeBuilders.StakeCreateBuilder;
        const stakeTransaction = stakeBuilder
            .stakeAsset(7889400, stakeAmount)
            .nonce("2")
            .sign("secret")
            .build();

        try {
            await walletManager.applyTransaction(stakeTransaction);
        } catch (error) {
            fail(error);
        }

        expect(voter.getAttribute("stakeWeight", Utils.BigNumber.ZERO)).toEqual(stakeAmount.times(configManager.getMilestone().stakeLevels['7889400']).dividedBy(10));

        expect(voter.balance).toEqual(
            initialBalance
                .minus(stakeAmount)
                .minus(stakeTransaction.data.fee)
                .minus(voteTransaction.data.fee),
        );
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegateWallet.balance

                .plus(voter.balance)
                .plus(voter.getAttribute("stakeWeight")),
        );
        expect(voter.balance).toEqual(
            Utils.BigNumber.make(initialBalance)
                .minus(stakeTransaction.data.asset.stakeCreate.amount)
                .minus(voteTransaction.data.fee)
                .minus(stakeTransaction.data.fee),
        );
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegateWallet.balance

                .plus(voter.balance)
                .plus(voter.getAttribute("stakeWeight")),
        );
        expect(voter.getAttribute("stakes")[stakeTransaction.id]).toEqual({
            id: 'b5318f00902b3462f914c88d163879dd8b883b487eb5133b1abd0e1839129f0b',
            amount: stakeAmount,
            duration: 7889400,
            weight: stakeAmount.times(configManager.getMilestone().stakeLevels['7889400']).dividedBy(10),
            redeemableTimestamp: stakeTransaction.data.asset.stakeCreate.timestamp + 7889400,
            redeemed: false,
            halved: false,
            timestamp: 1234567890,
        });

        const unvoteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`-${delegateKeys.publicKey}`])
            .nonce(voter.nonce.plus(1)).sign("secret")
            .build();

        await walletManager.applyTransaction(unvoteTransaction);

        expect(voter.balance).toEqual(
            initialBalance
                .minus(stakeTransaction.data.asset.stakeCreate.amount)
                .minus(voteTransaction.data.fee)
                .minus(stakeTransaction.data.fee)
                .minus(unvoteTransaction.data.fee),
        );
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);

        await walletManager.revertTransaction(unvoteTransaction);

        jest.spyOn(app, "resolve").mockReturnValue([
            {
                publicKey: voter.publicKey,
                stakeKey: 1234567890,
                redeemableTimestamp: 1242457290,
            },
        ]);

        await walletManager.revertTransaction(stakeTransaction);
        expect(voter.getAttribute("stakeWeight", Utils.BigNumber.ZERO)).toEqual(Utils.BigNumber.ZERO);
        expect(voter.balance).toEqual(initialBalance.minus(voteTransaction.data.fee));
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance.plus(voter.balance));

        expect(voter.getAttribute("stakes")[stakeTransaction.id]).toBeUndefined();

        await walletManager.revertTransaction(voteTransaction);
        expect(voter.balance).toEqual(initialBalance);
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);
    });

    it("should create and redeem a stake", async () => {
        const store = app.resolvePlugin<State.IStateService>("state").getStore();

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: { timestamp: 1234567890 },
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(1234567890);

        const stakeBuilder = new StakeBuilders.StakeCreateBuilder;
        const stakeTransaction = stakeBuilder
            .stakeAsset(7889400, stakeAmount)
            .nonce(voter.nonce.plus(1)).sign("secret")
            .build();

        try {
            await walletManager.applyTransaction(stakeTransaction);
        } catch (error) {
            fail(error);
        }

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: { timestamp: voter.getAttribute("stakes")[stakeTransaction.id].redeemableTimestamp },
        });
        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(
            voter.getAttribute("stakes")[stakeTransaction.id].redeemableTimestamp,
        );

        const redeemBuilder = new StakeBuilders.StakeRedeemBuilder;
        const stakeRedeemTransaction = redeemBuilder
            .stakeAsset(stakeTransaction.id)
            .nonce(voter.nonce.plus(1)).sign("secret")
            .build();

        try {
            await walletManager.applyTransaction(stakeRedeemTransaction);
        } catch (error) {
            fail(error);
        }

        expect(voter.balance).toEqual(
            initialBalance.minus(stakeTransaction.data.fee).minus(stakeRedeemTransaction.data.fee),
        );
        expect(voter.getAttribute("stakeWeight", Utils.BigNumber.ZERO)).toEqual(Utils.BigNumber.ZERO);
    });

    it("should halve the wallet stakeWeight and update delegate voteBalance after stake expiration", async () => {
        const store = app.resolvePlugin<State.IStateService>("state").getStore();

        const stakeOneTime = 1234567890;

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: {
                timestamp: stakeOneTime,
            }
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(stakeOneTime);

        const delegateKeys = Identities.Keys.fromPassphrase("delegate");
        const delegateWallet = walletManager.findByPublicKey(delegateKeys.publicKey);
        delegateWallet.setAttribute("delegate.username", "unittest");
        delegateWallet.balance = Utils.BigNumber.make(5000 * ARKTOSHI);
        delegateWallet.setAttribute("vote", delegateWallet.publicKey);
        delegateWallet.setAttribute<Utils.BigNumber>("delegate.voteBalance", delegateWallet.balance);
        walletManager.reindex(delegateWallet);

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance);

        const voteTransaction = Transactions.BuilderFactory.vote()
            .votesAsset([`+${delegateKeys.publicKey}`])
            .nonce(voter.nonce.plus(1)).sign("secret")
            .build();

        try {
            await walletManager.applyTransaction(voteTransaction);
        } catch (error) {
            fail(error);
        }
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(delegateWallet.balance.plus(voter.balance));

        const stakeBuilder = new StakeBuilders.StakeCreateBuilder;
        const stakeTransaction = stakeBuilder
            .stakeAsset(15778800, stakeAmount)
            .nonce(voter.nonce.plus(1))
            .sign("secret")
            .build();

        try {
            await walletManager.applyTransaction(stakeTransaction);
        } catch (error) {
            fail(error);
        }
        expect(voter.getAttribute("stakeWeight")).toEqual(stakeAmount.times(85).dividedBy(10));
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegateWallet.balance

                .plus(voter.balance)
                .plus(voter.getAttribute("stakeWeight")),
        );

        const txTwoTime = 1234567890 + 16778800;

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: {
                timestamp: txTwoTime,
            },
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(txTwoTime);

        jest.spyOn(app, "has").mockReturnValue(true);
        jest.spyOn(app, "resolve").mockReturnValue([
            {
                publicKey: voter.publicKey,
                stakeKey: stakeOneTime,
                redeemableTimestamp: stakeOneTime + 15778800,
            },
        ]);

        console.log({
            publicKey: voter.publicKey,
            stakeKey: stakeOneTime,
            redeemableTimestamp: stakeOneTime + 15778800,
        });

        ExpireHelper.processExpirations(store.getLastBlock().data);

        expect(voter.getAttribute("stakeWeight")).toEqual(
            Utils.BigNumber.make(
                stakeAmount
                    .times(configManager.getMilestone().stakeLevels['15778800']).dividedBy(10)
                    .dividedBy(2)
                    .toFixed(0, 1),
            ),
        );

        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegateWallet.balance
                .plus(voter.balance)
                .plus(voter.getAttribute("stakeWeight")),
        );

        const txThreeTime = 1234567890 + 17778800;

        jest.spyOn(store, "getLastBlock").mockReturnValue({
            // @ts-ignore
            data: {
                timestamp: txThreeTime,
            },
        });

        jest.spyOn(Crypto.Slots, "getTime").mockReturnValue(txThreeTime);

        const transferTx2 = Transactions.BuilderFactory.transfer()
            .amount(stakeAmount)
            .fee(
                Utils.BigNumber.make("5")
                    .times(ARKTOSHI)
                    .toString(),
            )
            .recipientId(voter.address)
            .nonce(voter.nonce.plus(1)).sign("secret")
            .build();
        try {
            await walletManager.applyTransaction(transferTx2);
        } catch (error) {
            fail(error);
        }
        expect(voter.getAttribute("stakeWeight")).toEqual(
            Utils.BigNumber.make(
                stakeAmount
                    .times(configManager.getMilestone().stakeLevels['15778800'])
                    .dividedBy(2)
                    .toFixed(0, 1),
            ),
        );
        expect(delegateWallet.getAttribute<Utils.BigNumber>("delegate.voteBalance")).toEqual(
            delegateWallet.balance

                .plus(voter.balance)
                .plus(voter.getAttribute("stakeWeight")),
        );
    });
});
