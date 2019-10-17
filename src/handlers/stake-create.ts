import { app } from "@arkecosystem/core-container";
import { Database, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Interfaces, Managers, Transactions, Utils, Constants } from "@arkecosystem/crypto";
import { Handlers, TransactionReader } from "@arkecosystem/core-transactions";
import { IStakeCreateAsset, IStakeArray, IStakeObject } from "../interfaces";
import { VoteWeight } from "../helpers";


export class StakeCreateTransactionHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return Transactions.HtlcLockTransaction;
    }

    public dependencies(): ReadonlyArray<Handlers.TransactionHandlerConstructor> {
        return [];
    }

    public walletAttributes(): ReadonlyArray<string> {
        return ["stakes"];
    }

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const reader: TransactionReader = await TransactionReader.create(connection, this.getConstructor());

        while (reader.hasNext()) {
            const transactions = await reader.read();

            for (const transaction of transactions) {
                const wallet: State.IWallet = walletManager.findByPublicKey(transaction.senderPublicKey);
                const stakeObject = VoteWeight.stakeObject(transaction.asset.stakeCreate);
                const stakes = wallet.getAttribute<IStakeArray>("stakes");
                Object.assign(stakes, {
                    ...stakes,
                    [transaction.id]: stakeObject
                });

                wallet.setAttribute<IStakeArray>("stakes", stakes);
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
        const o: IStakeObject = VoteWeight.stakeObject(data.asset.stakeCreate);

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
        return true;
    }

    public async applyToSender(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        await super.applyToSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);


        walletManager.reindex(sender);
    }

    public async revertForSender(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        await super.revertForSender(transaction, walletManager);

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