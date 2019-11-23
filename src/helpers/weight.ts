import { Managers, Utils } from "@arkecosystem/crypto";
import { Interfaces } from "@nosplatform/stake-transactions-crypto";

class VoteWeight {
    public static stakeObject(s: Interfaces.IStakeCreateAsset, id: string): any {
        const configManager = Managers.configManager;
        const milestone = configManager.getMilestone();
        const multiplier: number = milestone.stakeLevels[s.duration];
        const amount = Utils.BigNumber.make(s.amount);
        const sWeight: Utils.BigNumber = amount.times(multiplier).dividedBy(10);
        const redeemableTimestamp = s.timestamp + s.duration;
        const timestamp = s.timestamp;

        const o: Interfaces.IStakeObject = {
            id,
            timestamp,
            amount,
            duration: s.duration,
            weight: sWeight,
            redeemableTimestamp,
            redeemed: false,
            halved: false,
        };

        return o;
    }
}

export { VoteWeight };