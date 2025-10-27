(define-constant ERR-NOT-AUTHORIZED u200)
(define-constant ERR-CHALLENGE-NOT-COMPLETED u201)
(define-constant ERR-NFT-ALREADY-MINTED u202)
(define-constant ERR-INVALID-CHALLENGE-ID u203)
(define-constant ERR-USER-NOT-PARTICIPANT u204)
(define-constant ERR-PROOF-NOT-SUBMITTED u205)
(define-constant ERR-METADATA-URI-TOO-LONG u206)
(define-constant ERR-NFT-TRANSFER-FAILED u207)
(define-constant ERR-INVALID-TOKEN-ID u208)
(define-constant ERR-TOKEN-NOT-OWNED u209)
(define-constant ERR-INSUFFICIENT-BALANCE u210)

(define-data-var last-token-id uint u0)
(define-data-var mint-fee uint u100)
(define-data-var royalty-recipient principal tx-sender)
(define-data-var royalty-percent uint u500)

(define-non-fungible-token fitness-achievement uint)

(define-map token-metadata
  uint
  {
    challenge-id: uint,
    title: (string-ascii 100),
    category: (string-ascii 50),
    difficulty: uint,
    completion-date: uint,
    proof-hash: (buff 32),
    metadata-uri: (string-ascii 256)
  }
)

(define-map minted-nfts
  { challenge-id: uint, user: principal }
  uint
)

(define-read-only (get-last-token-id)
  (ok (var-get last-token-id))
)

(define-read-only (get-token-metadata (token-id uint))
  (map-get? token-metadata token-id)
)

(define-read-only (get-nft-id-for-user (challenge-id uint) (user principal))
  (map-get? minted-nfts { challenge-id: challenge-id, user: user })
)

(define-read-only (get-mint-fee)
  (ok (var-get mint-fee))
)

(define-read-only (get-royalty-info)
  (ok { recipient: (var-get royalty-recipient), percent: (var-get royalty-percent) })
)

(define-public (set-mint-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get royalty-recipient)) (err ERR-NOT-AUTHORIZED))
    (var-set mint-fee new-fee)
    (ok true)
  )
)

(define-public (set-royalty-info (recipient principal) (percent uint))
  (begin
    (asserts! (is-eq tx-sender (var-get royalty-recipient)) (err ERR-NOT-AUTHORIZED))
    (asserts! (<= percent u1000) (err ERR-NOT-AUTHORIZED))
    (var-set royalty-recipient recipient)
    (var-set royalty-percent percent)
    (ok true)
  )
)

(define-public (mint-achievement
  (challenge-id uint)
  (title (string-ascii 100))
  (category (string-ascii 50))
  (difficulty uint)
  (proof-hash (buff 32))
  (metadata-uri (string-ascii 256))
)
  (let (
        (user tx-sender)
        (token-id (+ (var-get last-token-id) u1))
        (existing-nft (map-get? minted-nfts { challenge-id: challenge-id, user: user }))
      )
    (asserts! (is-none existing-nft) (err ERR-NFT-ALREADY-MINTED))
    (asserts! (<= (len metadata-uri) u256) (err ERR-METADATA-URI-TOO-LONG))
    (try! (contract-call? .ChallengeManager get-challenge challenge-id))
    (let ((user-challenge (try! (contract-call? .ChallengeManager get-user-challenge user challenge-id))))
      (asserts! (get completed user-challenge) (err ERR-CHALLENGE-NOT-COMPLETED))
      (asserts! (get proof-submitted user-challenge) (err ERR-PROOF-NOT-SUBMITTED))
    )
    (let ((proof (try! (contract-call? .ChallengeManager get-challenge-proof challenge-id user))))
      (asserts! (is-eq (get proof-hash proof) proof-hash) (err ERR-PROOF-NOT-SUBMITTED))
    )
    (try! (stx-transfer? (var-get mint-fee) tx-sender (var-get royalty-recipient)))
    (let ((royalty-amount (/ (* (var-get mint-fee) (var-get royalty-percent)) u10000)))
      (try! (stx-transfer? royalty-amount tx-sender (var-get royalty-recipient)))
    )
    (try! (nft-mint? fitness-achievement token-id user))
    (map-set token-metadata token-id
      {
        challenge-id: challenge-id,
        title: title,
        category: category,
        difficulty: difficulty,
        completion-date: block-height,
        proof-hash: proof-hash,
        metadata-uri: metadata-uri
      }
    )
    (map-set minted-nfts { challenge-id: challenge-id, user: user } token-id)
    (var-set last-token-id token-id)
    (print { event: "nft-minted", token-id: token-id, user: user, challenge-id: challenge-id })
    (ok token-id)
  )
)

(define-public (transfer-achievement (token-id uint) (recipient principal))
  (let ((owner (unwrap! (nft-get-owner? fitness-achievement token-id) (err ERR-INVALID-TOKEN-ID))))
    (asserts! (is-eq tx-sender owner) (err ERR-TOKEN-NOT-OWNED))
    (try! (nft-transfer? fitness-achievement token-id tx-sender recipient))
    (print { event: "nft-transferred", token-id: token-id, from: tx-sender, to: recipient })
    (ok true)
  )
)

(define-public (burn-achievement (token-id uint))
  (let ((owner (unwrap! (nft-get-owner? fitness-achievement token-id) (err ERR-INVALID-TOKEN-ID))))
    (asserts! (is-eq tx-sender owner) (err ERR-TOKEN-NOT-OWNED))
    (try! (nft-burn? fitness-achievement token-id tx-sender))
    (map-delete token-metadata token-id)
    (print { event: "nft-burned", token-id: token-id })
    (ok true)
  )
)