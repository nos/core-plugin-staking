import { app } from "@arkecosystem/core-container";
import { Database, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Interfaces, Managers, Transactions, Utils, Constants } from "@arkecosystem/crypto";
import { Handlers, TransactionReader } from "@arkecosystem/core-transactions";
import { IStakeCreateAsset, IStakeArray, IStakeObject } from "../interfaces";
import { VoteWeight } from "../helpers";
import { StakeTimestampError, StakeAlreadyExistsError, StakeNotIntegerError, NotEnoughBalanceError, StakeDurationError } from "../errors";
import { StakeCreateTransaction } from "../transactions/stake-create";
import { ExpireHelper } from "../helpers/expire";
import { roundCalculator } from "@arkecosystem/core-utils";


export class StakeCreateTransactionHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return StakeCreateTransaction;
    }

    public dependencies(): ReadonlyArray<Handlers.TransactionHandlerConstructor> {
        return [];
    }

    public walletAttributes(): ReadonlyArray<string> {
        return ["stakes", "stakeWeight"];
    }

    public async isActivated(): Promise<boolean> {
        return true;
    }

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const reader: TransactionReader = await TransactionReader.create(connection, this.getConstructor());
        const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");
        const lastBlock: Interfaces.IBlock = await app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getLastBlock();
        const roundHeight: number = roundCalculator.calculateRound(lastBlock.data.height).roundHeight;
        const roundBlock: Interfaces.IBlockData = await databaseService.blocksBusinessRepository.findByHeight(
            roundHeight,
        );
        //TODO: get milestone belonging to transaction block height
        while (reader.hasNext()) {
            const transactions = await reader.read();
            for (const transaction of transactions) {
                const wallet: State.IWallet = walletManager.findByPublicKey(transaction.senderPublicKey);
                const stakeObject: IStakeObject = VoteWeight.stakeObject(transaction.asset.stakeCreate, transaction.id);
                const stakes = wallet.getAttribute<IStakeArray>("stakes");
                if (roundBlock.timestamp > stakeObject.redeemableTimestamp) {
                    stakeObject.weight = Utils.BigNumber.make(stakeObject.weight.dividedBy(2).toFixed());
                    stakeObject.halved = true;
                }
                Object.assign(stakes, {
                    ...stakes,
                    [transaction.id]: stakeObject
                });
                wallet.setAttribute<IStakeArray>("stakes", stakes);
                const newWeight = wallet.getAttribute("stakeWeight", Utils.BigNumber.ZERO).plus(stakeObject.weight);
                wallet.setAttribute("stakeWeight", newWeight);
                ExpireHelper.storeExpiry(stakeObject, wallet, transaction.id);
                walletManager.reindex(wallet);
            }
        }
    }

    public async throwIfCannotBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: State.IWallet,
        databaseWalletManager: State.IWalletManager,
    ): Promise<void> {
        const stake: IStakeCreateAsset = transaction.data.asset.stakeCreate;
        const lastBlock: Interfaces.IBlock = app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getLastBlock();

        const { data }: Interfaces.ITransaction = transaction;
        const o: IStakeObject = VoteWeight.stakeObject(data.asset.stakeCreate, transaction.id);

        const timestampDiff = stake.timestamp - lastBlock.data.timestamp;
        if (
            !transaction.timestamp &&
            (timestampDiff > Managers.configManager.getMilestone().blocktime * 4 || timestampDiff < 0)
        ) {
            throw new StakeTimestampError();
        }

        if (transaction.id in wallet.getAttribute("stakes")) {
            throw new StakeAlreadyExistsError();
        }

        // Amount can only be in increments of 1 NOS
        if (o.amount.dividedBy(Constants.ARKTOSHI).toString().includes(".")) {
            throw new StakeNotIntegerError();
        }

        if (o.amount.isGreaterThan(wallet.balance.minus(Utils.BigNumber.make(data.fee)))) {
            throw new NotEnoughBalanceError();
        }

        const configManager = Managers.configManager;
        const milestone = configManager.getMilestone();

        if (!o.duration || milestone.stakeLevels[o.duration] === undefined) {
            throw new StakeDurationError();
        }

        return super.throwIfCannotBeApplied(transaction, wallet, databaseWalletManager);
    }

    public async canEnterTransactionPool(
        data: Interfaces.ITransactionData,
        pool: TransactionPool.IConnection,
        processor: TransactionPool.IProcessor,
    ): Promise<boolean> {
        if (this.typeFromSenderAlreadyInPool(data, pool, processor)) {
            return false;
        }
        return true;
    }

    public async applyToSender(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        await super.applyToSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const o: IStakeObject = VoteWeight.stakeObject(transaction.data.asset.stakeCreate, transaction.id);
        const newBalance = sender.balance.minus(o.amount);
        const newWeight = sender.getAttribute("stakeWeight", Utils.BigNumber.ZERO).plus(o.weight);
        const stakes = sender.getAttribute<IStakeArray>("stakes");

        Object.assign(stakes, {
            ...stakes,
            [transaction.id]: o,
        });

        sender.setAttribute("stakeWeight", newWeight);
        sender.setAttribute("stakes", stakes);
        sender.balance = newBalance;

        ExpireHelper.storeExpiry(o, sender, transaction.id);

        walletManager.reindex(sender);
    }

    public async revertForSender(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        await super.revertForSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const o: IStakeObject = VoteWeight.stakeObject(transaction.data.asset.stakeCreate, transaction.id);
        const newBalance = sender.balance.plus(o.amount);
        const newWeight = sender.getAttribute("stakeWeight", Utils.BigNumber.ZERO).minus(o.weight);
        const stakes = sender.getAttribute<IStakeArray>("stakes");

        Object.assign(stakes, {
            ...stakes,
            [transaction.id]: undefined,
        });

        sender.setAttribute("stakeWeight", newWeight);
        sender.setAttribute("stakes", stakes);
        sender.balance = newBalance;

        walletManager.reindex(sender);
    }

    public async applyToRecipient(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
        // tslint:disable-next-line: no-empty
    ): Promise<void> { }

    public async revertForRecipient(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
        // tslint:disable-next-line: no-empty
    ): Promise<void> { }
}