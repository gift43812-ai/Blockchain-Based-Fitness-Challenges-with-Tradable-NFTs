(define-constant ERR-NOT-AUTHORIZED u300)
(define-constant ERR-LISTING-NOT-FOUND u301)
(define-constant ERR-INVALID-PRICE u302)
(define-constant ERR-LISTING-EXPIRED u303)
(define-constant ERR-ALREADY-LISTED u304)
(define-constant ERR-NOT-LISTED u305)
(define-constant ERR-INSUFFICIENT-BALANCE u306)
(define-constant ERR-TRANSFER-FAILED u307)
(define-constant ERR-BID-TOO-LOW u308)
(define-constant ERR-BID-NOT-FOUND u309)
(define-constant ERR-MIN-BID-INCREMENT u310)
(define-constant ERR-MARKETPLACE-CLOSED u311)
(define-constant ERR-INVALID-TOKEN-ID u312)
(define-constant ERR-TOKEN-NOT-OWNED u313)
(define-constant ERR-MARKETPLACE-FEE u314)

(define-data-var marketplace-fee-percent uint u250)
(define-data-var marketplace-fee-recipient principal tx-sender)
(define-data-var marketplace-active bool true)
(define-data-var listing-counter uint u0)

(define-map listings
  uint
  {
    token-id: uint,
    seller: principal,
    price: uint,
    expiry: uint,
    min-bid-increment: uint,
    highest-bid: uint,
    highest-bidder: (optional principal),
    active: bool
  }
)

(define-map token-listings
  uint
  uint
)

(define-map user-bids
  { token-id: uint, bidder: principal }
  uint
)

(define-read-only (get-listing (listing-id uint))
  (map-get? listings listing-id)
)

(define-read-only (get-listing-id-for-token (token-id uint))
  (map-get? token-listings token-id)
)

(define-read-only (get-user-bid (token-id uint) (bidder principal))
  (map-get? user-bids { token-id: token-id, bidder: bidder })
)

(define-read-only (get-marketplace-fee-info)
  (ok {
    fee-percent: (var-get marketplace-fee-percent),
    recipient: (var-get marketplace-fee-recipient),
    active: (var-get marketplace-active)
  })
)

(define-public (set-marketplace-fee (percent uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender (var-get marketplace-fee-recipient)) (err ERR-NOT-AUTHORIZED))
    (asserts! (<= percent u1000) (err ERR-INVALID-PRICE))
    (var-set marketplace-fee-percent percent)
    (var-set marketplace-fee-recipient recipient)
    (ok true)
  )
)

(define-public (toggle-marketplace (active bool))
  (begin
    (asserts! (is-eq tx-sender (var-get marketplace-fee-recipient)) (err ERR-NOT-AUTHORIZED))
    (var-set marketplace-active active)
    (ok true)
  )
)

(define-public (list-nft
  (token-id uint)
  (price uint)
  (duration uint)
  (min-bid-increment uint)
)
  (let (
        (listing-id (var-get listing-counter))
        (owner (unwrap! (contract-call? .NFTMinter nft-get-owner? fitness-achievement token-id) (err ERR-INVALID-TOKEN-ID)))
        (existing-listing (map-get? token-listings token-id))
      )
    (asserts! (var-get marketplace-active) (err ERR-MARKETPLACE-CLOSED))
    (asserts! (is-eq tx-sender owner) (err ERR-TOKEN-NOT-OWNED))
    (asserts! (is-none existing-listing) (err ERR-ALREADY-LISTED))
    (asserts! (> price u0) (err ERR-INVALID-PRICE))
    (asserts! (> duration u0) (err ERR-INVALID-PRICE))
    (asserts! (>= min-bid-increment u1) (err ERR-MIN-BID-INCREMENT))
    (map-set listings listing-id
      {
        token-id: token-id,
        seller: tx-sender,
        price: price,
        expiry: (+ block-height duration),
        min-bid-increment: min-bid-increment,
        highest-bid: u0,
        highest-bidder: none,
        active: true
      }
    )
    (map-set token-listings token-id listing-id)
    (var-set listing-counter (+ listing-id u1))
    (print { event: "nft-listed", listing-id: listing-id, token-id: token-id, price: price })
    (ok listing-id)
  )
)

(define-public (cancel-listing (listing-id uint))
  (let ((listing (unwrap! (map-get? listings listing-id) (err ERR-LISTING-NOT-FOUND))))
    (asserts! (get active listing) (err ERR-NOT-LISTED))
    (asserts! (is-eq (get seller listing) tx-sender) (err ERR-NOT-AUTHORIZED))
    (map-set listings listing-id (merge listing { active: false }))
    (map-delete token-listings (get token-id listing))
    (print { event: "listing-cancelled", listing-id: listing-id })
    (ok true)
  )
)

(define-public (buy-now (listing-id uint))
  (let (
        (listing (unwrap! (map-get? listings listing-id) (err ERR-LISTING-NOT-FOUND)))
        (token-id (get token-id listing))
        (price (get price listing))
      )
    (asserts! (get active listing) (err ERR-NOT-LISTED))
    (asserts! (< block-height (get expiry listing)) (err ERR-LISTING-EXPIRED))
    (asserts! (var-get marketplace-active) (err ERR-MARKETPLACE-CLOSED))
    (let ((fee-amount (/ (* price (var-get marketplace-fee-percent)) u10000)))
      (try! (stx-transfer? price tx-sender (get seller listing)))
      (try! (stx-transfer? fee-amount tx-sender (var-get marketplace-fee-recipient)))
      (try! (contract-call? .NFTMinter transfer-achievement token-id tx-sender))
      (map-set listings listing-id (merge listing { active: false }))
      (map-delete token-listings token-id)
      (print { event: "nft-sold", listing-id: listing-id, buyer: tx-sender, price: price })
      (ok true)
    )
  )
)

(define-public (place-bid (listing-id uint) (bid-amount uint))
  (let (
        (listing (unwrap! (map-get? listings listing-id) (err ERR-LISTING-NOT-FOUND)))
        (current-bid (get highest-bid listing))
        (min-next-bid (+ current-bid (get min-bid-increment listing)))
      )
    (asserts! (get active listing) (err ERR-NOT-LISTED))
    (asserts! (< block-height (get expiry listing)) (err ERR-LISTING-EXPIRED))
    (asserts! (var-get marketplace-active) (err ERR-MARKETPLACE-CLOSED))
    (asserts! (>= bid-amount min-next-bid) (err ERR-BID-TOO-LOW))
    (asserts! (not (is-eq tx-sender (get seller listing))) (err ERR-NOT-AUTHORIZED))
    (match (get highest-bidder listing)
      prev-bidder
        (try! (stx-transfer? current-bid (as-contract tx-sender) prev-bidder))
      (begin true)
    )
    (try! (stx-transfer? bid-amount tx-sender (as-contract tx-sender)))
    (map-set listings listing-id
      (merge listing {
        highest-bid: bid-amount,
        highest-bidder: (some tx-sender)
      })
    )
    (map-set user-bids { token-id: (get token-id listing), bidder: tx-sender } bid-amount)
    (print { event: "bid-placed", listing-id: listing-id, bidder: tx-sender, amount: bid-amount })
    (ok true)
  )
)

(define-public (accept-bid (listing-id uint))
  (let (
        (listing (unwrap! (map-get? listings listing-id) (err ERR-LISTING-NOT-FOUND)))
        (bidder (unwrap! (get highest-bidder listing) (err ERR-BID-NOT-FOUND)))
        (bid-amount (get highest-bid listing))
        (token-id (get token-id listing))
      )
    (asserts! (get active listing) (err ERR-NOT-LISTED))
    (asserts! (is-eq (get seller listing) tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (var-get marketplace-active) (err ERR-MARKETPLACE-CLOSED))
    (let ((fee-amount (/ (* bid-amount (var-get marketplace-fee-percent)) u10000)))
      (try! (stx-transfer? (- bid-amount fee-amount) (as-contract tx-sender) tx-sender))
      (try! (stx-transfer? fee-amount (as-contract tx-sender) (var-get marketplace-fee-recipient)))
      (try! (contract-call? .NFTMinter transfer-achievement token-id bidder))
      (map-set listings listing-id (merge listing { active: false }))
      (map-delete token-listings token-id)
      (map-delete user-bids { token-id: token-id, bidder: bidder })
      (print { event: "bid-accepted", listing-id: listing-id, bidder: bidder, amount: bid-amount })
      (ok true)
    )
  )
)