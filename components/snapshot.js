import React, { useState } from 'react';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { PromisePool } from '@supercharge/promise-pool';

const Snapshot = () => {
    const [collectionAddress, setCollectionAddress] = useState('');
    const [excludeContracts, setExcludeContracts] = useState(false);
    const [outputFileName, setOutputFileName] = useState('');
    const [removeDuplicates, setRemoveDuplicates] = useState(false);
    const [countTokens, setCountTokens] = useState(false);
    const [holders, setHolders] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isDataReady, setIsDataReady] = useState(false);

    const config = {
        rpc: "<SET-YOUR-OWN-RPC>",
        network: "pacific-1"
    };

    const downloadFile = () => {
        let dataToDownload = holders;
        if (removeDuplicates) {
            dataToDownload = [...new Set(holders)];
        }
        const data = dataToDownload.join('\n');
        const blob = new Blob([data], { type: 'text/plain' });
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = outputFileName || 'snapshot.txt';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(href);
    };

    const handleSnapshot = async () => {
        if (!collectionAddress) {
            alert("Please enter a collection address");
            return;
        }

        setIsLoading(true);
        setError(null);
        setIsDataReady(false);

        try {
            const client = await SigningCosmWasmClient.connect(config.rpc);


            const numTokensResult = await client.queryContractSmart(collectionAddress, {
                num_tokens: {}
            });
            const numTokens = parseInt(numTokensResult.count);

            let startTokenId = 1;
            try {
                await client.queryContractSmart(collectionAddress, {
                    owner_of: { token_id: '0' }
                });
                startTokenId = 0;
            } catch (error) {
            }

            const { results } = await PromisePool
                .withConcurrency(10)
                .for([...Array(numTokens).keys()].map(i => String(i + startTokenId)))
                .process(async token_id => {
                    try {
                        const result = await client.queryContractSmart(collectionAddress, {
                            owner_of: { token_id }
                        });
                        return result.owner;
                    } catch (error) {
                        console.error(`Error fetching owner for token ${token_id}:`, error);
                        return false;
                    }
                });

            let owners = results.filter(o => o !== false);
            if (excludeContracts) {
                owners = owners.filter(o => o.length <= 42);
            }

            let outputData = owners;
            if (countTokens) {
                const ownerCounts = owners.reduce((acc, owner) => {
                    acc[owner] = (acc[owner] || 0) + 1;
                    return acc;
                }, {});
                outputData = Object.entries(ownerCounts).map(([owner, count]) => `${owner}: ${count}`);
            }

            setHolders(outputData);
            setIsDataReady(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className='snapshot'>
            <h1>Take a Snapshot</h1>
            <div className="input-field">
                <input 
                    type="text"
                    value={collectionAddress}
                    onChange={(e) => setCollectionAddress(e.target.value)}
                    placeholder="Enter collection address"
                />
            </div>
            <div className="input-field">
                <input 
                    type="text"
                    value={outputFileName}
                    onChange={(e) => setOutputFileName(e.target.value)}
                    placeholder="Output file name (optional)"
                />
            </div>
            <div className="checkbox-container">
                <input 
                    type="checkbox"
                    checked={excludeContracts}
                    onChange={(e) => setExcludeContracts(e.target.checked)}
                />
                <label>Exclude contract addresses</label>
            </div>
            <div className="checkbox-container">
                <input 
                    type="checkbox"
                    checked={removeDuplicates}
                    onChange={(e) => setRemoveDuplicates(e.target.checked)}
                />
                <label>Remove duplicate addresses</label>
            </div>
            <div className="button">
                <button onClick={handleSnapshot} disabled={isLoading}>
                    {isLoading ? <div className="spinner"></div> : null}
                    {isLoading ? 'Loading...' : 'Take Snapshot'}
                </button>
            </div>
            {isDataReady && (
                <div className="button">
                    <button onClick={downloadFile}>Download Results</button>
                </div>
            )}

            {error && <div>Error: {error}</div>}
        </div>
    );
};

export default Snapshot;