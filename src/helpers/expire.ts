import { app } from '@arkecosystem/core-container';
import { Database, EventEmitter, State, TransactionPool } from '@arkecosystem/core-interfaces';
import { Interfaces, Utils } from '@arkecosystem/crypto';
import { Interfaces as StakeInterfaces } from '@nosplatform/stake-transactions-crypto';
import { createHandyClient } from 'handy-redis';

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
        const stakes: StakeInterfaces.IStakeArray = wallet.getAttribute("stakes", {});
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
            // First deduct previous stakePower from from delegate voteBalance
            if (delegate) {
                delegate.setAttribute("delegate.voteBalance", delegate.getAttribute("delegate.voteBalance").minus(wallet.getAttribute("stakePower", Utils.BigNumber.ZERO)));
                poolDelegate.setAttribute("delegate.voteBalance", poolDelegate.getAttribute("delegate.voteBalance").minus(wallet.getAttribute("stakePower", Utils.BigNumber.ZERO)));
            }

            // Deduct old stake object power from voter stakePower
            const walletStakePower = wallet.getAttribute<Utils.BigNumber>("stakePower").minus(stake.power);
            // Set new stake object power
            const prevStakePower = stake.power;
            const newStakePower = Utils.BigNumber.make(Utils.BigNumber.make(stake.power).dividedBy(2).toFixed());
            // Update voter total stakePower
            const newWalletStakePower = walletStakePower.plus(newStakePower);

            stake.halved = true;
            stake.power = newStakePower;
            stakes[stakeKey] = stake;

            wallet.setAttribute("stakePower", newWalletStakePower);
            wallet.setAttribute("stakes", JSON.parse(JSON.stringify(stakes)));

            const poolWallet = poolService.walletManager.findByPublicKey(wallet.publicKey);
            poolWallet.setAttribute("stakePower", newWalletStakePower);
            poolWallet.setAttribute("stakes", JSON.parse(JSON.stringify(stakes)));

            // Update delegate voteBalance
            if (delegate) {
                delegate.setAttribute("delegate.voteBalance", delegate.getAttribute("delegate.voteBalance").plus(wallet.getAttribute("stakePower")));
                poolDelegate.setAttribute("delegate.voteBalance", poolDelegate.getAttribute("delegate.voteBalance").plus(wallet.getAttribute("stakePower")));
            }


            const walletManager1 = databaseService.walletManager;
            const walletManager2 = poolService.walletManager;
            walletManager1.reindex(delegate);
            walletManager1.reindex(wallet);
            walletManager2.reindex(poolDelegate);
            walletManager2.reindex(poolWallet);

            this.emitter.emit("stake.released", { publicKey: wallet.publicKey, stakeKey, block, prevStakePower });
        }

        // If the stake is somehow still unreleased, don't remove it from db
        if (!(block.timestamp <= stake.redeemableTimestamp)) {
            this.removeExpiry(stakeKey);
        }

    }

    public static async storeExpiry(
        stake: StakeInterfaces.IStakeObject,
        wallet: State.IWallet,
        stakeKey: string,
    ): Promise<void> {
        const redis = createHandyClient();
        const key = `stake:${stakeKey}`;
        const exists = await redis.exists(key);
        if (!exists) {
            await redis.hmset(key, ['publicKey', wallet.publicKey], ['redeemableTimestamp', stake.redeemableTimestamp.toString()], ['stakeKey', stakeKey]);
            await redis.zadd('stake_expirations', [stake.redeemableTimestamp, key]);
        }
    }

    public static async removeExpiry(
        stakeKey: string,
    ): Promise<void> {
        const redis = createHandyClient();
        const key = `stake:${stakeKey}`;
        await redis.del(key);
        await redis.zrem("stake_expirations", `stake:${stakeKey}`);
    }

    public static async processExpirations(block: Interfaces.IBlockData): Promise<void> {
        const redis = createHandyClient();
        const databaseService: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");
        const lastTime = block.timestamp;
        const keys = await redis.zrangebyscore('stake_expirations', 0, lastTime);
        const expirations = [];
        let expirationsCount = 0;
        for (const key of keys) {
            const obj = await redis.hgetall(key);
            expirations.push(obj);
            expirationsCount++;
        }
        if (expirationsCount > 0) {
            app.resolvePlugin("logger").info("Processing stake expirations.");
            for (const expiration of expirations) {
                const wallet = databaseService.walletManager.findByPublicKey(expiration.publicKey);
                if (
                    wallet.hasAttribute("stakes") &&
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
                    await this.removeExpiry(expiration.stakeKey);
                }
            }
        }
    }

    private static readonly emitter: EventEmitter.EventEmitter = app.resolvePlugin<EventEmitter.EventEmitter>(
        "event-emitter",
    );
}
