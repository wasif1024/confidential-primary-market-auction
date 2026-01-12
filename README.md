# Confidential Primary Market Auction

**MEV-resistant sealed-bid auctions for DeFi primary markets using MPC-based confidential compute on Solana.**

## Why This Works

This project addresses critical challenges in DeFi capital formation by combining:

- **MEV Resistance**: Sealed-bid architecture prevents front-running and bid manipulation through confidential computing
- **Primary Markets**: Enables fair, transparent capital formation for token launches and fundraising
- **MPC-Based Confidential Compute**: Uses Arcium's multi-party computation network to process bids confidentially
- **Solana**: Leverages Solana's high throughput and low latency for efficient auction execution

## Overview

A confidential auction system where bid amounts and bidder identities remain encrypted during the bidding period, preventing MEV extraction and ensuring fair price discovery. The system supports both first-price and second-price (Vickrey) auction mechanisms, making it suitable for various primary market use cases including token launches, NFT drops, and fundraising rounds.

## Key Features

### Sealed-Bid Architecture
- **Confidential Bidding**: All bid amounts and bidder identities are encrypted using MPC until auction resolution
- **MEV Protection**: Prevents front-running, sandwich attacks, and bid manipulation by keeping bids private
- **Fair Price Discovery**: Bidders can submit their true valuations without strategic concerns

### Auction Mechanisms
- **First-Price Auction**: Winner pays their bid amount
- **Second-Price Auction (Vickrey)**: Winner pays the second-highest bid, encouraging truthful bidding

### Core Operations
- **Initialize Auction**: Set up auction parameters (type, minimum bid, end time) with encrypted state initialization
- **Place Bid**: Submit encrypted bids that update the auction state confidentially without revealing amounts or identities
- **Resolve Auction**: Determine winner and payment amount based on auction type, revealing results only after bidding closes

### Technical Implementation
- Built on Solana using Anchor framework for on-chain state management
- Uses Arcium's MPC network for confidential computation off-chain
- Arcis framework for defining encrypted instructions
- Automatic account and data handling through Arcium macros

## Auction Lifecycle

1. **Open**: Auction accepts encrypted bids while keeping all information confidential
2. **Closed**: Bidding period ends, no new bids accepted
3. **Resolved**: Winner determined and payment amount calculated based on auction type

## Use Cases

- Token launch auctions for fair price discovery
- NFT primary market sales
- DeFi protocol fundraising rounds
- Any scenario requiring confidential bidding with MEV protection

## Project Structure

- **`programs/`**: Solana Anchor program handling on-chain state, account validation, and instruction processing
- **`encrypted-ixs/`**: Arcis-based confidential computing instructions for encrypted operations

The system uses a two-phase approach for confidential operations: initialization instructions queue computations on the Arcium network, and callback instructions receive encrypted results to update on-chain state.
