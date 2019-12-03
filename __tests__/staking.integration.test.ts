import { Container, Database } from '@arkecosystem/core-interfaces';
import { Constants, Identities, Managers, Networks, Utils } from '@arkecosystem/crypto/src';
import { Builders as StakeBuilders } from '@nosplatform/stake-transactions-crypto/src';
import * as fs from 'fs';
import * as path from 'path';

import { genesisBlock } from '../../../__tests__/utils/config/unitnet/genesisBlock';
import { Delegate } from '../../../packages/core-forger/src/delegate';
import { WalletManager } from '../../../packages/core-state/src/wallets';
import { setUp, tearDown } from './__support__/setup';

// import { StateBuilder } from '../../../packages/core-database-postgres/src';
// import { TransactionFactory } from '../../../__tests__/helpers/transaction-factory';
// import { wallets } from '../../../__tests__/utils/fixtures/unitnet';
let container: Container.IContainer;
let walletManager: WalletManager;
let database: Database.IDatabaseService;
// let stateBuilder: StateBuilder;

// const genesisWalletBalance = wallet =>
//     genesisBlock.transactions
//         .filter(t => t.recipientId === wallet.address)
//         .reduce((prev, curr) => prev.plus(curr.amount), Utils.BigNumber.ZERO)
//         .minus(
//             genesisBlock.transactions
//                 .filter(t => t.senderPublicKey === wallet.publicKey)
//                 .reduce((prev, curr) => prev.plus(curr.amount).plus(curr.fee), Utils.BigNumber.ZERO),
//         );

beforeAll(async () => {
    const dbPath = path.resolve(__dirname, `../../storage/databases/unitnet.sqlite`);
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }

    container = await setUp();

    Managers.configManager.setFromPreset("unitnet");
    Managers.configManager.setHeight(1);

    walletManager = new WalletManager();
    database = container.resolvePlugin<Database.IDatabaseService>("database");
    await database.reset();
});

afterAll(async () => {
    await database.reset();
    await tearDown();
});

const ARKTOSHI = Constants.ARKTOSHI;
let stakeAmount;
let stakerKeys;
let staker;
// let initialBalance;
// let stakeCreateHandler;
// let stakeRedeemHandler;
// let databaseService: Database.IDatabaseService;

beforeEach(() => {
    // databaseService = {
    //     connection: new DatabaseConnectionStub(),
    // } as Database.IDatabaseService;

    walletManager = new WalletManager();
    stakeAmount = Utils.BigNumber.make(10_000 * ARKTOSHI);
    stakerKeys = Identities.Keys.fromPassphrase("secret");
    staker = walletManager.findByPublicKey(stakerKeys.publicKey);
    staker.balance = stakeAmount.times(10);
    Managers.configManager.setFromPreset("testnet");
    Managers.configManager.setHeight(1);
    // initialBalance = staker.balance;
    // staker.nonce = Utils.BigNumber.ZERO;
    // stakeCreateHandler = new StakeCreateTransactionHandler();
    // stakeRedeemHandler = new StakeRedeemTransactionHandler();

});


describe("Htlc refund handler bootstrap", () => {
    it("should initialize wallet with balance and locked balance on bootstrap", async () => {
        const optionsDefault = {
            timestamp: 12345689,
            previousBlock: {
                id: genesisBlock.id,
                height: 1,
            },
            reward: Utils.BigNumber.ZERO,
            topReward: Utils.BigNumber.ZERO,
        };
        const stakeBuilder = new StakeBuilders.StakeCreateBuilder;
        const stakeTransaction = stakeBuilder
            .network(23)
            .stakeAsset(7889400, stakeAmount)
            .nonce(staker.nonce.plus(1)).sign("secret")
            .getStruct();

        const delegate = new Delegate("dummy passphrase", Networks.unitnet.network);
        const blockStake = delegate.forge([stakeTransaction], optionsDefault);
        await database.connection.saveBlock(blockStake);

        console.log(staker);

        // const refunder = wallets[14];
        // const refundTransaction = TransactionFactory.htlcRefund({ lockTransactionId: lockTransaction.id })
        //     .withNetwork("unitnet")
        //     .withPassphrase(refunder.passphrase) // anyone can ask for refund
        //     .withTimestamp(optionsDefault.timestamp + 1000)
        //     .createOne();
        // const blockRefund = delegate.forge([refundTransaction], {
        //     timestamp: 12346689,
        //     previousBlock: {
        //         id: blockLock.data.id,
        //         height: 2,
        //     },
        //     reward: Utils.BigNumber.ZERO,
        //     topReward: Utils.BigNumber.ZERO,
        // });
        // await database.connection.saveBlock(blockRefund);

        // await stateBuilder.run();

        // const recipientWallet = walletManager.findByAddress(recipientId);
        // expect(recipientWallet.balance).toEqual(Utils.BigNumber.ZERO);

        // const senderWallet = walletManager.findByAddress(sender.address);

        // expect(senderWallet.balance).toEqual(genesisWalletBalance(sender).minus(lockTransaction.fee));
        // expect(senderWallet.getAttribute("htlc.lockedBalance")).toEqual(Utils.BigNumber.ZERO);

        // const refunderWallet = walletManager.findByAddress(refunder.address);
        // expect(refunderWallet.balance).toEqual(genesisWalletBalance(refunder));
    });
});
