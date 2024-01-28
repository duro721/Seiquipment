import requests
import json
import os
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

# Read configuration from config.json
with open('config.json', 'r') as config_file:
    config = json.load(config_file)

base_url = config.get('base_url')
total_nfts = config.get('total_nfts')
folder_path = config.get('folder_path')
start_id = config.get('start_id')
batch_size = config.get('batch_size')

def download_single_metadata(url, file_path):
    response = requests.get(url)
    if response.status_code == 200:
        with open(file_path, 'w') as file:
            json.dump(response.json(), file)
        print(f"Downloaded {file_path}")
        return response.json()
    else:
        print(f"Failed to download metadata for {file_path}")
        return None

def download_metadata_batch(base_url, total_nfts, folder_path, start_id, batch_size):
    if os.path.exists(folder_path) and len(os.listdir(folder_path)) == total_nfts:
        print("Metadata already downloaded. Skipping download step.")
        metadata = []
        for i in range(start_id, start_id + total_nfts):
            file_path = os.path.join(folder_path, f'metadata_{i}.json')
            with open(file_path, 'r') as file:
                metadata.append(json.load(file))
        return metadata

    if not os.path.exists(folder_path):
        os.makedirs(folder_path)

    metadata = []
    with ThreadPoolExecutor(max_workers=8) as executor:  # You can adjust the max_workers as needed
        futures = []

        for i in range(start_id, start_id + total_nfts, batch_size):
            batch_end = min(start_id + total_nfts, i + batch_size)
            for j in range(i, batch_end):
                url = f"{base_url}/{j}"
                file_path = os.path.join(folder_path, f'metadata_{j}.json')
                futures.append(executor.submit(download_single_metadata, url, file_path))

        for future in futures:
            result = future.result()
            if result:
                metadata.append(result)

    return metadata

def analyze_traits(metadata):
    trait_counts = Counter()
    for item in metadata:
        for trait in item.get('attributes', []):
            trait_type = trait.get('trait_type')
            trait_value = trait.get('value')
            if trait_type and trait_value:
                trait_counts[(trait_type, trait_value)] += 1
    return trait_counts

def calculate_rarity(metadata, trait_counts, total_nfts):
    rarity_scores = []
    for item in metadata:
        item_rarity = {}
        total_rarity_score = 0

        # Extracting the ID from the name field
        name_parts = item.get('name', '').split('#')
        if len(name_parts) < 2:
            print(f"Warning: ID not found in metadata item: {item}")
            continue
        nft_id = name_parts[1].strip()

        for trait in item.get('attributes', []):
            trait_type = trait.get('trait_type')
            trait_value = trait.get('value')
            if trait_type and trait_value:
                trait_rarity_score = total_nfts / trait_counts[(trait_type, trait_value)]
                item_rarity[trait_value] = trait_rarity_score
                total_rarity_score += trait_rarity_score

        rarity_scores.append({
            "id": nft_id,
            "total_rarity_score": total_rarity_score,
            "trait_rarities": item_rarity
        })
    return rarity_scores

def rank_nfts(rarity_scores):
    return sorted(rarity_scores, key=lambda x: x['total_rarity_score'], reverse=True)

def create_output_json(ranked_nfts, collection_name):
    output = {}
    for rank, nft in enumerate(ranked_nfts, start=1):
        nft_number = nft['id']
        nft_id = f"{collection_name} #{nft_number}"

        output[nft_id] = {
            "rank": rank,
            "total_rarity_score": nft['total_rarity_score'],
            "trait_rarities": nft['trait_rarities']
        }
    return output

# Usage
metadata = download_metadata_batch(base_url, total_nfts, folder_path, start_id, batch_size)

collection_name = "Unknown"
if metadata:
    first_item_name = metadata[0].get('name', '')
    collection_name = first_item_name.split('#')[0].strip()

trait_counts = analyze_traits(metadata)
rarity_scores = calculate_rarity(metadata, trait_counts, total_nfts)
ranked_nfts = rank_nfts(rarity_scores)
output_json = create_output_json(ranked_nfts, collection_name)

# Writing the output to a JSON file
filename = f"{collection_name}_rarity_rankings.json".replace(" ", "_")
with open(filename, 'w') as file:
    json.dump(output_json, file, indent=4)

print(f"NFT rarity rankings have been saved to '{filename}'")
