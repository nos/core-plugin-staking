import { app } from '@arkecosystem/core-container';
import { Database } from '@arkecosystem/core-interfaces';
import { Identities, Managers, Utils } from '@arkecosystem/crypto';
import { Builders as StakeBuilders } from '@nosplatform/stake-transactions-crypto';
import got from 'got';

// import { TransactionFactory } from '../../../__tests__/helpers/transaction-factory';
import { secrets } from '../../../__tests__/utils/config/testnet/delegates.json';
import * as support from './__support__';

// import { Database } from '@arkecosystem/core-interfaces';
// import { TransactionFactory as StakeTransactionFactory } from './__functional__/factory';
// const { passphrase } = support.passphrases;

// import { generateMnemonic } from 'bip39';

beforeAll(support.setUp);
afterAll(support.tearDown);

describe("Transaction Forging - Stake create", () => {
    describe("Signed with 1 Passphrase", () => {

        it("should accept, broadcast and forge it", async () => {

            Managers.configManager.setFromPreset("testnet");

            // Initial Funds
            // const address = Identities.Address.fromPassphrase(secrets[0]);
            // const initialFunds = TransactionFactory.transfer(address, 100000 * 1e8)
            //     .withPassphrase(secrets[0])
            //     .createOne();

            // console.log(initialFunds);

            // const { body: body1 } = await got.post(`http://localhost:4003/api/v2/transactions`, {
            //     body: JSON.stringify({ transactions: [initialFunds] }),
            // });

            // console.log(body1)

            // await expect(initialFunds).toBeAccepted();
            // await support.snoozeForBlock(1);
            // await expect(initialFunds.id).toBeForged();
            // await support.snoozeForBlock(1);

            const nonce = app.resolvePlugin<Database.IDatabaseService>("database").walletManager.getNonce(Identities.PublicKey.fromPassphrase(secrets[0]));
            const stakeBuilder = new StakeBuilders.StakeCreateBuilder();
            const stakeCreate = stakeBuilder
                .stakeAsset(120, Utils.BigNumber.make(10000).times(1e8))
                .nonce(nonce.plus(2).toString())
                .sign(secrets[0])
                .getStruct();

            console.log(stakeCreate);

            const { body } = await got.post(`http://localhost:4003/api/v2/transactions`, {
                body: JSON.stringify({ transactions: [stakeCreate] }),
            });

            console.log(body);

            // expect(body).not.toBeNull();
            await support.snoozeForBlock(1);

            // console.log(stakeCreate.asset);
            // const myWallet = app.resolvePlugin<Database.IDatabaseService>("database").walletManager.findByAddress(wallet);
            // console.log(myWallet);

            // const db = app.resolvePlugin<Database.IDatabaseService>('database');
            // const lastBlock = await db.getLastBlock();

            // console.log(lastBlock);

            // await expect(stakeCreate).toBeAccepted();
            // await support.snoozeForBlock(1);
            // await expect(stakeCreate.id).toBeForged();
        });

        //     it("should be rejected, because wallet is already a business [Signed with 1 Passphrase]", async () => {
        //         // Registering a business again
        //         const businessRegistration = TransactionFactory.businessRegistration({
        //             name: "ark.io",
        //             website: "https://ark.io",
        //         })
        //             .withPassphrase(secrets[10])
        //             .createOne();

        //         await expect(businessRegistration).toBeRejected();
        //         await support.snoozeForBlock(1);
        //         await expect(businessRegistration.id).not.toBeForged();
        //     });

        //     it("should be rejected, because name business contains unicode control characters [Signed with 1 Passphrase]", async () => {
        //         // Registering a business with unicode control characters in its name
        //         const businessRegistration = TransactionFactory.businessRegistration({
        //             name: "\u0000ark",
        //             website: "https://ark.io",
        //         })
        //             .withPassphrase(secrets[1])
        //             .createOne();

        //         await expect(businessRegistration).toBeRejected();
        //         await support.snoozeForBlock(1);
        //         await expect(businessRegistration.id).not.toBeForged();
        //     });

        //     it("should be rejected, because business name contains disallowed characters [Signed with 1 Passphrase]", async () => {
        //         const disallowed = [" business", "business ", "busi  ness", "busi+ness", "busi. ness"];

        //         const businessRegistrations = [];

        //         // Business registrations
        //         for (const name of disallowed) {
        //             businessRegistrations.push(
        //                 TransactionFactory.businessRegistration({
        //                     name,
        //                     website: "https://ark.io",
        //                 })
        //                     .withPassphrase(secrets[1])
        //                     .createOne(),
        //             );
        //         }

        //         await expect(businessRegistrations).toBeEachRejected();
        //         await support.snoozeForBlock(1);

        //         for (const transaction of businessRegistrations) {
        //             await expect(transaction.id).not.toBeForged();
        //         }
        //     });

        //     it("should be rejected, because business registration is already in the pool [Signed with 1 Passphrase]", async () => {
        //         // Registering a business
        //         const businessRegistration = TransactionFactory.businessRegistration({
        //             name: "ark",
        //             website: "https://ark.io",
        //         })
        //             .withPassphrase(secrets[1])
        //             .createOne();

        //         // Registering a business again
        //         const businessRegistration2 = TransactionFactory.businessRegistration({
        //             name: "ark",
        //             website: "https://ark.io",
        //         })
        //             .withPassphrase(secrets[1])
        //             .withNonce(businessRegistration.nonce.plus(1))
        //             .createOne();

        //         await expect([businessRegistration, businessRegistration2]).not.toBeAllAccepted();
        //         await support.snoozeForBlock(1);
        //         await expect(businessRegistration.id).toBeForged();
        //         await expect(businessRegistration2.id).not.toBeForged();
        //     });

        //     it("should be rejected, because website is not valid uri [Signed with 1 Passphrase]", async () => {
        //         // Registering a business
        //         const businessRegistration = TransactionFactory.businessRegistration({
        //             name: "ark",
        //             website: "ark.io",
        //         })
        //             .withPassphrase(secrets[2])
        //             .createOne();

        //         await expect(businessRegistration).toBeRejected();
        //         await support.snoozeForBlock(1);
        //         await expect(businessRegistration.id).not.toBeForged();
        //     });

        //     it("should be rejected, because repository is not valid uri [Signed with 1 Passphrase]", async () => {
        //         // Registering a business
        //         const businessRegistration = TransactionFactory.businessRegistration({
        //             name: "ark",
        //             website: "https://ark.io",
        //             repository: "http//ark.io/repo",
        //         })
        //             .withPassphrase(secrets[3])
        //             .createOne();

        //         await expect(businessRegistration).toBeRejected();
        //         await support.snoozeForBlock(1);
        //         await expect(businessRegistration.id).not.toBeForged();
        //     });
        // });

        // describe("Signed with 2 Passphrases", () => {
        //     // Prepare a fresh wallet for the tests
        //     const passphrase = generateMnemonic();
        //     const secondPassphrase = generateMnemonic();

        //     it("should broadcast, accept and forge it [Signed with 2 Passphrases]", async () => {
        //         // Initial Funds
        //         const initialFunds = TransactionFactory.transfer(Identities.Address.fromPassphrase(passphrase), 150 * 1e8)
        //             .withPassphrase(secrets[0])
        //             .createOne();

        //         await expect(initialFunds).toBeAccepted();
        //         await support.snoozeForBlock(1);
        //         await expect(initialFunds.id).toBeForged();

        //         // Register a second passphrase
        //         const secondSignature = TransactionFactory.secondSignature(secondPassphrase)
        //             .withPassphrase(passphrase)
        //             .createOne();

        //         await expect(secondSignature).toBeAccepted();
        //         await support.snoozeForBlock(1);
        //         await expect(secondSignature.id).toBeForged();

        //         // Registering a business
        //         const businessRegistration = TransactionFactory.businessRegistration({
        //             name: "ark",
        //             website: "https://ark.io",
        //         })
        //             .withPassphrase(passphrase)
        //             .withSecondPassphrase(secondPassphrase)
        //             .createOne();

        //         await expect(businessRegistration).toBeAccepted();
        //         await support.snoozeForBlock(1);
        //         await expect(businessRegistration.id).toBeForged();
        //     });

        //     it("should be rejected, because wallet is already a business [Signed with 2 Passphrases]", async () => {
        //         // Registering a business again
        //         const businessRegistration = TransactionFactory.businessRegistration({
        //             name: "ark",
        //             website: "https://ark.io",
        //         })
        //             .withPassphrase(passphrase)
        //             .withSecondPassphrase(secondPassphrase)
        //             .createOne();

        //         await expect(businessRegistration).toBeRejected();
        //         await support.snoozeForBlock(1);
        //         await expect(businessRegistration.id).not.toBeForged();
        //     });
        // });

        // describe("Signed with multi signature [3 of 5]", () => {
        //     // Multi signature wallet data
        //     const passphrase = generateMnemonic();
        //     const registerPassphrases = [passphrase, secrets[1], secrets[2], secrets[3], secrets[4]];
        //     const signPassphrases = [passphrase, secrets[1], secrets[2]];
        //     const participants = [
        //         Identities.PublicKey.fromPassphrase(registerPassphrases[0]),
        //         Identities.PublicKey.fromPassphrase(registerPassphrases[1]),
        //         Identities.PublicKey.fromPassphrase(registerPassphrases[2]),
        //         Identities.PublicKey.fromPassphrase(registerPassphrases[3]),
        //         Identities.PublicKey.fromPassphrase(registerPassphrases[4]),
        //     ];
        //     let multiSigAddress;
        //     let multiSigPublicKey;
        //     it("should broadcast, accept and forge it [3 of 5]", async () => {
        //         // Initial Funds
        //         const initialFunds = TransactionFactory.transfer(Identities.Address.fromPassphrase(passphrase), 50 * 1e8)
        //             .withPassphrase(secrets[0])
        //             .createOne();

        //         await expect(initialFunds).toBeAccepted();
        //         await support.snoozeForBlock(1);
        //         await expect(initialFunds.id).toBeForged();

        //         // Registering a multi-signature wallet
        //         const multiSignature = TransactionFactory.multiSignature(participants, 3)
        //             .withPassphrase(passphrase)
        //             .withPassphraseList(registerPassphrases)
        //             .createOne();

        //         await expect(multiSignature).toBeAccepted();
        //         await support.snoozeForBlock(1);
        //         await expect(multiSignature.id).toBeForged();

        //         // Send funds to multi signature wallet
        //         multiSigAddress = Identities.Address.fromMultiSignatureAsset(multiSignature.asset.multiSignature);
        //         multiSigPublicKey = Identities.PublicKey.fromMultiSignatureAsset(multiSignature.asset.multiSignature);

        //         const multiSignatureFunds = TransactionFactory.transfer(multiSigAddress, 100 * 1e8)
        //             .withPassphrase(secrets[0])
        //             .createOne();

        //         await expect(multiSignatureFunds).toBeAccepted();
        //         await support.snoozeForBlock(1);
        //         await expect(multiSignatureFunds.id).toBeForged();

        //         // Registering a business
        //         const businessRegistration = TransactionFactory.businessRegistration({
        //             name: "ark",
        //             website: "https://ark.io",
        //         })
        //             .withSenderPublicKey(multiSigPublicKey)
        //             .withPassphraseList(signPassphrases)
        //             .createOne();

        //         await expect(businessRegistration).toBeAccepted();
        //         await support.snoozeForBlock(1);
        //         await expect(businessRegistration.id).toBeForged();
        //     });

        //     it("should be rejected, because wallet is already a business [3 of 5]", async () => {
        //         // Registering a business again
        //         const businessRegistration = TransactionFactory.businessRegistration({
        //             name: "ark",
        //             website: "https://ark.io",
        //         })
        //             .withSenderPublicKey(multiSigPublicKey)
        //             .withPassphraseList(signPassphrases)
        //             .createOne();

        //         await expect(businessRegistration).toBeRejected();
        //         await support.snoozeForBlock(1);
        //         await expect(businessRegistration.id).not.toBeForged();
        //     });
    });
});
