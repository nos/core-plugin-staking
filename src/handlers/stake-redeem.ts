import { Database, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Interfaces, Transactions, Utils } from "@arkecosystem/crypto";
import { Handlers, TransactionReader } from "@arkecosystem/core-transactions";
import { IStakeRedeemAsset, IStakeArray, IStakeObject } from "../interfaces";
import { WalletHasNoStakeError, StakeNotFoundError, StakeAlreadyRedeemedError, StakeNotYetRedeemableError } from "../errors";
import { StakeCreateTransactionHandler } from "./stake-create";
import { StakeRedeemTransaction } from "../transactions/stake-redeem";


export class StakeRedeemTransactionHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return StakeRedeemTransaction;
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

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const reader: TransactionReader = await TransactionReader.create(connection, this.getConstructor());
        //TODO: get milestone belonging to transaction block height
        while (reader.hasNext()) {
            const transactions = await reader.read();
            for (const transaction of transactions) {
                const wallet: State.IWallet = walletManager.findByPublicKey(transaction.senderPublicKey);
                const s: IStakeRedeemAsset = transaction.asset.stakeRedeem;
                const txId = s.txId;
                // Refund stake
                const stakes = wallet.getAttribute("stakes", {});
                const stake: IStakeObject = stakes[txId];
                const newBalance = wallet.balance.plus(stake.amount);
                const newWeight = wallet.getAttribute("stakeWeight", Utils.BigNumber.ZERO).minus(stake.weight);

                Object.assign(stakes, {
                    ...stakes,
                    [txId]: {
                        ...stake,
                        redeemed: true,
                    },
                });

                wallet.balance = newBalance;
                wallet.setAttribute<IStakeArray>("stakes", stakes);
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
        let stakeArray: IStakeArray;
        const sender = databaseWalletManager.findByPublicKey(wallet.publicKey);

        const stakes = sender.getAttribute("stakes", {});

        // Get wallet stake if it exists
        if (stakes === {}) {
            throw new WalletHasNoStakeError();
        }

        const { data }: Interfaces.ITransaction = transaction;
        const txId = data.asset.stakeRedeem.txId;

        if (!(txId in stakeArray)) {
            throw new StakeNotFoundError();
        }

        if (stakeArray[txId].redeemed) {
            throw new StakeAlreadyRedeemedError();
        }

        // TODO: Get transaction's block round timestamp instead of transaction timestamp.
        if (
            (!transaction.timestamp && !stakeArray[txId].halved) ||
            (transaction.timestamp && transaction.timestamp < stakeArray[txId].redeemableTimestamp)
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
        if (this.typeFromSenderAlreadyInPool(data, pool, processor)) {
            return false;
        }
        return true;
    }

    public async applyToSender(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        super.applyToSender(transaction, walletManager);
        //TODO: get milestone belonging to transaction block height
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const txId = t.asset.stakeRedeem.txId;
        const stakes = sender.getAttribute("stakes", {});
        const stake = stakes[txId];
        // Refund stake
        const newBalance = sender.balance.plus(stake.amount);
        const newWeight = sender.getAttribute("stakeWeight", Utils.BigNumber.ZERO).minus(stake.weight);
        Object.assign(stakes, {
            ...stakes,
            [txId]: {
                ...stake,
                redeemed: true,
            },
        });

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
        const txId = t.asset.stakeRedeem.txId;
        const stakes = sender.getAttribute("stakes", {});
        const stake = stakes[txId];
        // Revert refund stake
        const newBalance = sender.balance.minus(stake.amount);
        const newWeight = sender.getAttribute("stakeWeight", Utils.BigNumber.ZERO).plus(stake.weight);
        Object.assign(stakes, {
            ...stakes,
            [txId]: {
                ...stake,
                redeemed: false,
            }
        });

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