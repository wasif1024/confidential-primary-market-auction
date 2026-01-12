use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

const COMP_DEF_OFFSET_INIT_AUCTION_STATE: u32 = comp_def_offset("init_auction_state");
const COMP_DEF_OFFSET_PLACE_BID: u32 = comp_def_offset("place_bid");
const COMP_DEF_OFFSET_FIRST_WINNER: u32 = comp_def_offset("first_winner");
const COMP_DEF_OFFSET_SECOND_WINNER: u32 = comp_def_offset("second_winner");
declare_id!("C2vZo71gwGS4NGB1Kh7GnxuWUuYbJi47V4yARYuHm31U");
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum AuctionType {
    FirstPrice,
    SecondPrice,
}
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum AuctionStatus {
    Open,
    Closed,
    Resolved,
}
#[arcium_program]
pub mod ws_confidential_primary_market_auction {
    use super::*;
pub fn init_auction_state_comp_def(ctx: Context<InitAuctionStateCompDef>) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}
pub fn init_place_bid_comp_def(ctx: Context<InitPlaceBidCompDef>) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}
pub fn init_second_winner_comp_def(ctx: Context<InitSecondWinnerCompDef>) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}
pub fn init_first_winner_comp_def(ctx: Context<InitFirstWinnerCompDef>) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}
pub fn init_auction_state(
    ctx: Context<InitAuctionState>,
    computation_offset: u64,
    auction_type: AuctionType,
    min_bid: u64,
    end_time: i64,
    nonce: u128,
) -> Result<()> {
    let auction = &mut ctx.accounts.auction;
    auction.bump = ctx.bumps.auction;
    auction.authority = ctx.accounts.authority.key();
    auction.auction_type = auction_type;
    auction.status = AuctionStatus::Open;
    auction.min_bid = min_bid;
    auction.end_time = end_time;
    auction.bid_count = 0;
    auction.state_nonce = nonce;
    auction.encrypted_state = [[0u8; 32]; 5];

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let args = ArgBuilder::new().plaintext_u128(nonce).build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        None,
        vec![InitAuctionStateCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: ctx.accounts.auction.key(),
                is_writable: true,
            }],
        )?],
        1,
        0,
    )?;

    Ok(())
}

#[arcium_callback(encrypted_ix = "init_auction_state")]
pub fn init_auction_state_callback(
    ctx: Context<InitAuctionStateCallback>,
    output: SignedComputationOutputs<InitAuctionStateOutput>,
) -> Result<()> {
    let o = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(InitAuctionStateOutput { field_0 }) => field_0,
        Err(_) => return Err(ErrorCode::AbortedComputation.into()),
    };

    let auction_key = ctx.accounts.auction.key();
    let authority = ctx.accounts.auction.authority;
    let auction_type = ctx.accounts.auction.auction_type;
    let min_bid = ctx.accounts.auction.min_bid;
    let end_time = ctx.accounts.auction.end_time;

    let auction = &mut ctx.accounts.auction;
    auction.encrypted_state = o.ciphertexts;
    auction.state_nonce = o.nonce;

    emit!(AuctionCreatedEvent {
        auction: auction_key,
        authority,
        auction_type,
        min_bid,
        end_time,
    });

    Ok(())
}
}
#[account]
#[derive(InitSpace)]
pub struct Auction{
    pub bump: u8,
    pub authority: Pubkey,
    pub auction_type: AuctionType,
    pub min_bid: u64,
    pub end_time: i64,
    pub status: AuctionStatus,
    pub bid_count: u8,
    pub state_nonce: u128,
    pub encrypted_state: [[u8; 32]; 5],
}
#[queue_computation_accounts("init_auction_state", authority)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct InitAuctionState<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init,payer=authority,space=8+Auction::INIT_SPACE,seeds=[b"auction".as_ref()],bump)]
    pub auction: Account<'info, Auction>,
    #[account(
        init_if_needed,
        space = 9,
        payer = authority,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, SignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_INIT_AUCTION_STATE))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("init_auction_state")]
#[derive(Accounts)]
pub struct InitAuctionStateCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_INIT_AUCTION_STATE))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, checked by arcium program via constraints in the callback context.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub auction: Account<'info, Auction>,
}
#[init_computation_definition_accounts("init_auction_state", payer)]
#[derive(Accounts)]
pub struct InitAuctionStateCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}
#[init_computation_definition_accounts("place_bid", payer)]
#[derive(Accounts)]
pub struct InitPlaceBidCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}
#[init_computation_definition_accounts("second_winner", payer)]
#[derive(Accounts)]
pub struct InitSecondWinnerCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}
#[init_computation_definition_accounts("first_winner", payer)]
#[derive(Accounts)]
pub struct InitFirstWinnerCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct AuctionCreatedEvent {
    pub auction: Pubkey,
    pub authority: Pubkey,
    pub auction_type: AuctionType,
    pub min_bid: u64,
    pub end_time: i64,
}
#[event]
pub struct BidPlacedEvent {
    pub auction: Pubkey,
    pub bid_count: u8,
}
#[event]
pub struct AuctionClosedEvent {
    pub auction: Pubkey,
    pub bid_count: u8,
}
#[event]
pub struct AuctionResolvedEvent {
    pub auction: Pubkey,
    pub winner: [u8; 32],
    pub payment_amount: u64,
    pub auction_type: AuctionType,
}

#[error_code]
pub enum ErrorCode {
    #[msg("The computation was aborted")]
    AbortedComputation,
    #[msg("Cluster not set")]
    ClusterNotSet,
    #[msg("Auction is not open for bidding")]
    AuctionNotOpen,
    #[msg("Auction is not closed yet")]
    AuctionNotClosed,
    #[msg("Wrong auction type for this operation")]
    WrongAuctionType,
    #[msg("Unauthorized")]
    Unauthorized,
}