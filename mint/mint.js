import { GasPrice } from "@cosmjs/stargate";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1Wallet } from "@cosmjs/proto-signing";
import { chains } from "chain-registry";
import fs from "fs/promises";
import readline from "readline";

let globalSigner;
let globalChain;

async function main() {
    try {
        const privateKey = await askQuestion("Enter your private key: ");
        
        const configFile = await fs.readFile('config.json', 'utf-8');
        const config = JSON.parse(configFile);

        const contractAddress = config.contractAddress;
        const rpcEndpoint = config.rpcEndpoint;
        const gasPrice = config.gasPrice;
        const collection = config.collection;
        const group = config.group;
        const recipient = config.recipient;

        const chain = chains.find(({ chain_name }) => chain_name === 'sei');
        let pk = privateKey;
        if (pk.startsWith("0x")) {
            pk = pk.slice(2);
        }
        const signer = await DirectSecp256k1Wallet.fromKey(Buffer.from(pk, 'hex'), "sei");
        globalSigner = signer;
        globalChain = chain;

        const msg = {
            "mint_native": {
                collection,
                group,
                recipient
            }
        };
        const funds = [];

        const [sender] = await signer.getAccounts();
        const fee = "auto";

        const client = await SigningCosmWasmClient.connectWithSigner(
            rpcEndpoint,
            signer,
            { gasPrice: GasPrice.fromString(gasPrice) }
        );

        const tx = await client.execute(
            sender.address,
            contractAddress,
            msg,
            fee,
            undefined,
            funds
        );

        const seiscanLink = `https://www.seiscan.app/atlantic-2/txs/${tx.transactionHash}`;
        console.log(`Transaction Hash: ${tx.transactionHash}`);
        console.log(`Transaction completed! [View Transaction on Seiscan](${seiscanLink})`);
    } catch (error) {
        console.error(error);
        let errorMessage = "Error executing mint transaction.";

        if (error.message.includes("Max Tokens Minted")) {
            errorMessage = "Maximum tokens have already been minted for this collection.";
        }

        console.error(errorMessage);
    }
}

async function askQuestion(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

main();