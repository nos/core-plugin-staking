import { Database, EventEmitter, State, TransactionPool } from '@arkecosystem/core-interfaces';
import { Handlers, Interfaces as TransactionInterfaces, TransactionReader } from '@arkecosystem/core-transactions';
import { Interfaces, Transactions, Utils } from '@arkecosystem/crypto';
import { Interfaces as StakeInterfaces, Transactions as StakeTransactions } from '@nosplatform/stake-transactions-crypto';

import { StakeAlreadyRedeemedError, StakeNotFoundError, StakeNotYetRedeemableError, WalletHasNoStakeError } from '../errors';
import { StakeCreateTransactionHandler } from './stake-create';

export class StakeRedeemTransactionHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return StakeTransactions.StakeRedeemTransaction;
    }

    public dependencies(): ReadonlyArray<Handlers.TransactionHandlerConstructor> {
        return [StakeCreateTransactionHandler];
    }

    public walletAttributes(): ReadonlyArray<string> {
        return [];
    }

    public async isActivated(): Promise<boolean> {
        return true;
    }

    public dynamicFee(context: TransactionInterfaces.IDynamicFeeContext): Utils.BigNumber {
        // override dynamicFee calculation as this is a zero-fee transaction
        return Utils.BigNumber.ZERO;
    }

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const reader: TransactionReader = await TransactionReader.create(connection, this.getConstructor());
        // TODO: get milestone belonging to transaction block height
        while (reader.hasNext()) {
            const transactions = await reader.read();
            for (const transaction of transactions) {
                const wallet: State.IWallet = walletManager.findByPublicKey(transaction.senderPublicKey);
                const s: StakeInterfaces.IStakeRedeemAsset = transaction.asset.stakeRedeem;
                const txId = s.id;
                // Refund stake
                const stakes = wallet.getAttribute("stakes", {});
                const stake: StakeInterfaces.IStakeObject = stakes[txId];
                const newBalance = wallet.balance.plus(stake.amount);
                const newWeight = wallet.getAttribute("stakeWeight", Utils.BigNumber.ZERO).minus(stake.weight);

                stake.redeemed = true;
                stakes[txId] = stake;

                wallet.balance = newBalance;
                wallet.setAttribute<StakeInterfaces.IStakeArray>("stakes", stakes);
                wallet.setAttribute<Utils.BigNumber>("stakeWeight", newWeight);
                walletManager.reindex(wallet);
            }
        }
    }

    public async throwIfCannotBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: State.IWallet,
        databaseWalletManager: State.IWalletManager,
    ): Promise<void> {
        const sender = databaseWalletManager.findByPublicKey(wallet.publicKey);
        const stakes: StakeInterfaces.IStakeArray = sender.getAttribute("stakes", {});

        // Get wallet stake if it exists
        if (stakes === {}) {
            throw new WalletHasNoStakeError();
        }

        const { data }: Interfaces.ITransaction = transaction;
        const txId = data.asset.stakeRedeem.id;

        if (!(txId in stakes)) {
            throw new StakeNotFoundError();
        }

        if (stakes[txId].redeemed) {
            throw new StakeAlreadyRedeemedError();
        }

        // TODO: Get transaction's block round timestamp instead of transaction timestamp.
        if (
            (!transaction.timestamp && !stakes[txId].halved) ||
            (transaction.timestamp && transaction.timestamp < stakes[txId].redeemableTimestamp)
        ) {
            throw new StakeNotYetRedeemableError();
        }

        return super.throwIfCannotBeApplied(transaction, wallet, databaseWalletManager);
    }

    public async canEnterTransactionPool(
        data: Interfaces.ITransactionData,
        pool: TransactionPool.IConnection,
        processor: TransactionPool.IProcessor,
    ): Promise<boolean> {
        if (await this.typeFromSenderAlreadyInPool(data, pool, processor)) {
            processor.pushError(
                data,
                "ERR_PENDING",
                `Stake transaction from this wallet is already in the pool`,
            );
            return false;
        }
        return true;
    }

    public emitEvents(transaction: Interfaces.ITransaction, emitter: EventEmitter.EventEmitter): void {
        emitter.emit("stake.redeemed", transaction.data);
    }

    public async applyToSender(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        await super.applyToSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const txId = t.asset.stakeRedeem.id;
        const stakes = sender.getAttribute("stakes", {});
        const stake = stakes[txId];

        // Refund stake
        const newBalance = sender.balance.plus(stake.amount);
        const newWeight = sender.getAttribute("stakeWeight").minus(stake.weight);
        stake.redeemed = true;
        stakes[txId] = stake;

        sender.balance = newBalance;
        sender.setAttribute("stakeWeight", newWeight);
        sender.setAttribute("stakes", stakes);
        walletManager.reindex(sender);
    }

    public async revertForSender(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        await super.revertForSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const txId = t.asset.stakeRedeem.id;
        const stakes = sender.getAttribute("stakes", {});
        const stake = stakes[txId];
        // Revert refund stake
        const newBalance = sender.balance.minus(stake.amount);
        const newWeight = sender.getAttribute("stakeWeight", Utils.BigNumber.ZERO).plus(stake.weight);
        stake.redeemed = false;
        stakes[txId] = stakes;

        sender.balance = newBalance;
        sender.setAttribute("stakeWeight", newWeight);
        sender.setAttribute("stakes", stakes);

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