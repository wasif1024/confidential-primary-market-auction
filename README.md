# Confidential Primary Market Auction

**MEV-resistant sealed-bid auctions for DeFi primary markets using MPC-based confidential compute on Solana.**

This project implements a confidential sealed-bid auction primitive for DeFi primary markets, enabling private price discovery and MEV-resistant asset allocation using MPC-based confidential computing on Solana.

## Why Primary Markets?

Primary markets are where new assets are issued and capital is formed. On public blockchains, transparent bidding leads to:

- **Bid sniping and MEV extraction**: Front-runners can observe and outbid participants at the last moment
- **Whale dominance during token launches**: Large bidders can signal their intent, discouraging smaller participants
- **Manipulated price discovery**: Strategic bidding behavior distorts true market valuations
- **Strategic information leakage**: Public bid visibility enables collusion and coordination attacks

Sealed-bid auctions with confidential compute restore fairness by keeping bids private until settlement, ensuring all participants have equal opportunity regardless of size or timing.

## Threat Model & Mitigations

- **Front-running** → prevented via encrypted bids that remain confidential during the bidding period
- **Bid sniping** → no mid-auction visibility of bid amounts or bidders
- **Whale signaling** → bid amounts remain confidential, preventing market manipulation through size revelation
- **MEV extraction** → sealed execution with delayed reveal ensures no extractable value from bid information

## Overview

A confidential auction system where bid amounts and bidder identities remain encrypted during the bidding period, preventing MEV extraction and ensuring fair price discovery. The system supports both first-price and second-price (Vickrey) auction mechanisms, making it suitable for various primary market use cases including token launches, NFT drops, and fundraising rounds.

## Key Features

### Sealed-Bid Architecture
- **Confidential Bidding**: All bid amounts and bidder identities are encrypted using MPC until auction resolution
- **MEV Protection**: Prevents front-running, sandwich attacks, and bid manipulation by keeping bids private
- **Fair Price Discovery**: Bidders can submit their true valuations without strategic concerns

### Auction Mechanisms
- **First-Price Auction**: The highest bidder wins and pays their bid amount. All bid information remains confidential until resolution.
- **Second-Price Auction (Vickrey)**: The highest bidder wins but pays the second-highest bid amount. This mechanism encourages truthful bidding as bidders have incentive to bid their true valuation. All bid information remains confidential until resolution.

### Core Operations
- **Initialize Auction**: Set up auction parameters (type, minimum bid, end time) with encrypted state initialization
- **Place Bid**: Submit encrypted bids that update the auction state confidentially without revealing amounts or identities
- **Close Auction**: Auction authority closes the bidding period, preventing new bids from being placed
- **Resolve First-Price Auction**: For first-price auctions, determines the winner (highest bidder) and payment amount (their bid) through confidential computation, revealing results only after the auction is closed
- **Resolve Second-Price Auction**: For second-price (Vickrey) auctions, determines the winner (highest bidder) and payment amount (second-highest bid) through confidential computation, encouraging truthful bidding

### Technical Implementation
- Built on Solana using Anchor framework for on-chain state management
- Uses Arcium's MPC network for confidential computation off-chain
- Arcis framework for defining encrypted instructions
- Automatic account and data handling through Arcium macros

## Auction Lifecycle

1. **Open**: Auction accepts encrypted bids while keeping all information confidential. Bids are processed confidentially and update the encrypted auction state, tracking the highest and second-highest bids without revealing their values or bidders.

2. **Closed**: Auction authority closes the bidding period, preventing new bids from being placed. The auction status transitions from Open to Closed.

3. **Resolved**: The authority calls the appropriate resolve instruction based on auction type:
   - **First-Price**: Uses confidential computation to determine the winner (highest bidder) who pays their bid amount
   - **Second-Price (Vickrey)**: Uses confidential computation to determine the winner (highest bidder) who pays the second-highest bid amount
   
   The winner's identity and payment amount are revealed, and the auction status is set to Resolved.

## Use Cases

- Token launch auctions for fair price discovery
- NFT primary market sales
- DeFi protocol fundraising rounds
- Any scenario requiring confidential bidding with MEV protection

## Project Structure

- **`programs/`**: Solana Anchor program handling on-chain state, account validation, and instruction processing
- **`encrypted-ixs/`**: Arcis-based confidential computing instructions for encrypted operations

The system uses a two-phase approach for confidential operations: initialization instructions queue computations on the Arcium network, and callback instructions receive encrypted results to update on-chain state.
