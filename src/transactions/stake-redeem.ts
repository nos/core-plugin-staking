import { Transactions, Utils } from "@arkecosystem/crypto";
import ByteBuffer from "bytebuffer";
import { StakeTransactionGroup, StakeTransactionType, StakeTransactionStaticFees } from "../enums";
import { IStakeRedeemAsset } from "../interfaces";

const { schemas } = Transactions;

export class StakeRedeemTransaction extends Transactions.Transaction {
    public static typeGroup: number = StakeTransactionGroup;
    public static type: number = StakeTransactionType.StakeRedeem;
    public static key: string = "stakeRedeem";

    public static getSchema(): Transactions.schemas.TransactionSchema {
        return schemas.extend(schemas.transactionBaseSchema, {
            $id: "stakeRedeem",
            required: ["asset", "typeGroup"],
            properties: {
                type: { transactionType: this.type },
                typeGroup: { const: this.typeGroup },
                amount: { bignumber: { minimum: 0, maximum: 0 } },
                asset: {
                    type: "object",
                    required: ["stakeRedeem"],
                    properties: {
                        stakeRedeem: {
                            type: "object",
                            required: ["txId"],
                            properties: {
                                txId: {
                                    type: "string",
                                    $ref: "hex",
                                    minLength: 64,
                                    maxLength: 64,
                                },
                            },
                        },
                    },
                },
            },
        });
    }

    protected static defaultStaticFee: Utils.BigNumber = Utils.BigNumber.make(StakeTransactionStaticFees.StakeRedeem);

    public serialize(): ByteBuffer {
        const { data } = this;
        const stakeRedeem = data.asset.stakeRedeem as IStakeRedeemAsset;

        const txIdBytes = Buffer.from(stakeRedeem.txId, "utf8");
        const buffer = new ByteBuffer(txIdBytes.length + 1, true);

        buffer.writeUint8(txIdBytes.length);
        buffer.append(txIdBytes, "hex");

        return buffer;
    }

    public deserialize(buf: ByteBuffer): void {
        const { data } = this;
        const stakeRedeem = {} as IStakeRedeemAsset;

        const txIdLength = buf.readUint8();
        stakeRedeem.txId = buf.readString(txIdLength);

        data.asset = {
            stakeRedeem,
        };
    }
}
