import { LessThan } from 'typeorm';

import { app } from '@arkecosystem/core-container';
import { Database, EventEmitter, State, TransactionPool } from '@arkecosystem/core-interfaces';
import { Interfaces, Utils } from '@arkecosystem/crypto';
import { Interfaces as StakeInterfaces } from '@nosplatform/stake-transactions-crypto';
import { Stake } from '@nosplatform/storage';

export interface IExpirationObject {
    publicKey: string;
    stakeKey: string;
    redeemableTimestamp: number;
}

export class ExpireHelper {
    public static async expireStake(
        wallet: State.IWallet,
        stakeKey: string,
        block: Interfaces.IBlockData,
    ): Promise<void> {

        const stakes: StakeInterfaces.IStakeArray = wallet.getAttribute("stakes");
        const stake: StakeInterfaces.IStakeObject = stakes[stakeKey];

        if (!stake.halved && !stake.redeemed && block.timestamp > stake.redeemableTimestamp) {
            const databaseService: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");
            const poolService: TransactionPool.IConnection = app.resolvePlugin<TransactionPool.IConnection>(
                "transaction-pool",
            );

            app.resolvePlugin("logger").info(`Stake released: ${stakeKey} of wallet ${wallet.address}.`);

            let delegate: State.IWallet;
            let poolDelegate: State.IWallet;
            if (wallet.hasVoted()) {
                delegate = databaseService.walletManager.findByPublicKey(wallet.getAttribute("vote"));
                poolDelegate = poolService.walletManager.findByPublicKey(wallet.getAttribute("vote"));
            }
            // First deduct previous stakeWeight from from delegate voteBalance
            if (delegate) {
                delegate.setAttribute("delegate.voteBalance", delegate.getAttribute("delegate.voteBalance").minus(wallet.getAttribute("stakeWeight", Utils.BigNumber.ZERO)));
                poolDelegate.setAttribute("delegate.voteBalance", poolDelegate.getAttribute("delegate.voteBalance").minus(wallet.getAttribute("stakeWeight", Utils.BigNumber.ZERO)));
            }
            // Deduct old stake object weight from voter stakeWeight
            const walletStakeWeight = wallet.getAttribute<Utils.BigNumber>("stakeWeight").minus(stake.weight);
            // Set new stake object weight
            const newStakeWeight = Utils.BigNumber.make(stake.weight.dividedBy(2).toFixed());
            // Update voter total stakeWeight
            const newWalletStakeWeight = walletStakeWeight.plus(newStakeWeight);

            Object.assign(stakes, {
                ...stakes,
                [stakeKey]: {
                    ...stake,
                    halved: true,
                    weight: newStakeWeight,
                },
            });

            wallet.setAttribute("stakeWeight", newWalletStakeWeight);
            wallet.setAttribute("stakes", stakes);

            const poolWallet = poolService.walletManager.findByPublicKey(wallet.publicKey);
            poolWallet.setAttribute("stakeWeight", newWalletStakeWeight);
            poolWallet.setAttribute("stakes", stakes);

            // Update delegate voteBalance
            if (delegate) {
                delegate.setAttribute("delegate.voteBalance", delegate.getAttribute("voteBalance").plus(wallet.getAttribute("stakeWeight")));
                poolDelegate.setAttribute("voteBalance", poolDelegate.getAttribute("voteBalance").plus(wallet.getAttribute("stakeWeight")));
            }

            this.emitter.emit("stake.released", { publicKey: wallet.publicKey, stakeKey, block });
        }

        // If the stake is somehow still unreleased, don't remove it from db
        if (!(block.timestamp <= stake.redeemableTimestamp)) {
            this.removeExpiry(stake, wallet, stakeKey);
        }
    }

    public static async storeExpiry(
        stake: StakeInterfaces.IStakeObject,
        wallet: State.IWallet,
        stakeKey: string,
    ): Promise<void> {
        const stakeModel = await Stake.findOne({
            address: wallet.address,
            redeemableTimestamp: stake.redeemableTimestamp,
            stakeKey,
        });
        if (!stakeModel && !wallet.getAttribute("stakes")[stakeKey].halved) {
            const stakeModel = new Stake();
            stakeModel.stakeKey = stakeKey;
            stakeModel.address = wallet.address;
            stakeModel.redeemableTimestamp = stake.redeemableTimestamp;
            await stakeModel.save();
        }
    }

    public static async removeExpiry(
        stake: StakeInterfaces.IStakeObject,
        wallet: State.IWallet,
        stakeKey: string,
    ): Promise<void> {
        const redeemableTimestamp = stake.redeemableTimestamp;
        const stakeModel = await Stake.findOne({ address: wallet.address, redeemableTimestamp, stakeKey });
        if (stakeModel) {
            await stakeModel.remove();
        }
    }

    public static async processExpirations(block: Interfaces.IBlockData): Promise<void> {
        const databaseService: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");
        const lastTime = block.timestamp;
        const [expirations, expirationsCount] = await Stake.findAndCount({
            where: { redeemableTimestamp: LessThan(lastTime) },
        });
        console.log(expirations);
        if (expirationsCount > 0) {
            app.resolvePlugin("logger").info("Processing stake expirations.");
            for (const expiration of expirations) {
                const wallet = databaseService.walletManager.findByAddress(expiration.address);
                if (
                    wallet.getAttribute("stakes")[expiration.stakeKey] !== undefined &&
                    wallet.getAttribute("stakes")[expiration.stakeKey].halved === false
                ) {
                    await this.expireStake(wallet, expiration.stakeKey, block);
                } else {
                    // If stake isn't found then the chain state has reverted to a point before its stakeCreate, or the stake was already halved.
                    // Delete expiration from db in this case
                    app.resolvePlugin("logger").info(
                        `Unknown or already processed ${expiration.stakeKey} of wallet ${wallet.address}. Deleted from storage.`,
                    );
                    await expiration.remove();
                }
            }
        }
    }

    private static readonly emitter: EventEmitter.EventEmitter = app.resolvePlugin<EventEmitter.EventEmitter>(
        "event-emitter",
    );
}
