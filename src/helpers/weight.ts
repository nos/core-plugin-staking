import { Managers, Utils } from "@arkecosystem/crypto";
import { IStakeObject, IStakeCreateAsset } from "../interfaces";

class VoteWeight {
    public static stakeObject(s: IStakeCreateAsset): any {
        const configManager = Managers.configManager;
        const milestone = configManager.getMilestone();
        const multiplier: number = milestone.stakeLevels[s.duration];
        const amount = Utils.BigNumber.make(s.amount);
        const sWeight: Utils.BigNumber = amount.times(multiplier);
        const redeemableTimestamp = s.timestamp + s.duration;
        const timestamp = s.timestamp;

        const o: IStakeObject = {
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