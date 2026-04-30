-- Backfill stale active purchase mortgages that have already reached a terminal state.
-- Dry-run check:
-- select id, player_id, tile_index from public.purchase_mortgages
-- where status = 'active'
--   and (
--     turns_remaining <= 0
--     or turns_elapsed >= term_turns
--     or principal_remaining <= 0
--   );

with stale_mortgages as (
  update public.purchase_mortgages
     set status = 'paid',
         principal_remaining = 0,
         turns_remaining = 0,
         accrued_interest_unpaid = 0,
         updated_at = now()
   where status = 'active'
     and (
       turns_remaining <= 0
       or turns_elapsed >= term_turns
       or principal_remaining <= 0
     )
 returning id
)
update public.property_ownership po
   set purchase_mortgage_id = null
  from stale_mortgages sm
 where po.purchase_mortgage_id = sm.id;
