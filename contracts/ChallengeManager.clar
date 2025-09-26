(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-CHALLENGE-NOT-FOUND u101)
(define-constant ERR-CHALLENGE-EXPIRED u102)
(define-constant ERR-ALREADY-JOINED u103)
(define-constant ERR-NOT-JOINED u104)
(define-constant ERR-INVALID-TITLE u105)
(define-constant ERR-INVALID-DESCRIPTION u106)
(define-constant ERR-INVALID-DURATION u107)
(define-constant ERR-INVALID-STAKE u108)
(define-constant ERR-INVALID-REWARD u109)
(define-constant ERR-INVALID-MIN-PARTICIPANTS u110)
(define-constant ERR-CHALLENGE-NOT-ACTIVE u111)
(define-constant ERR-INVALID-START-TIME u112)
(define-constant ERR-INVALID-PROOF u113)
(define-constant ERR-PROOF-ALREADY-SUBMITTED u114)
(define-constant ERR-CHALLENGE_FULL u115)
(define-constant ERR-INVALID-MAX-PARTICIPANTS u116)
(define-constant ERR-INVALID-DIFFICULTY u117)
(define-constant ERR-INVALID-CATEGORY u118)
(define-constant ERR-MAX-CHALLENGES_EXCEEDED u119)
(define-constant ERR-INVALID-STATUS u120)
(define-constant ERR-STAKE_NOT_MET u121)
(define-constant ERR-REWARD_DISTRIBUTION_FAILED u122)
(define-constant ERR-INVALID_CREATOR u123)
(define-constant ERR-INVALID_PARTICIPANT u124)
(define-constant ERR-EARLY_SUBMISSION u125)

(define-data-var challenge-counter uint u0)
(define-data-var max-challenges uint u1000)
(define-data-var creation-fee uint u500)
(define-data-var authority-contract (optional principal) none)

(define-map challenges
  uint
  {
    title: (string-ascii 100),
    description: (string-ascii 500),
    creator: principal,
    start-time: uint,
    end-time: uint,
    stake-amount: uint,
    reward-pool: uint,
    min-participants: uint,
    max-participants: uint,
    current-participants: uint,
    active: bool,
    difficulty: uint,
    category: (string-ascii 50),
    status: (string-ascii 20)
  }
)

(define-map user-challenges
  { user: principal, challenge-id: uint }
  { joined: bool, stake-paid: uint, proof-submitted: bool, completed: bool }
)

(define-map challenge-proofs
  { challenge-id: uint, user: principal }
  { proof-hash: (buff 32), submission-time: uint }
)

(define-map challenges-by-title
  (string-ascii 100)
  uint)

(define-read-only (get-challenge (id uint))
  (map-get? challenges id)
)

(define-read-only (get-user-challenge (user principal) (id uint))
  (map-get? user-challenges { user: user, challenge-id: id })
)

(define-read-only (get-challenge-proof (id uint) (user principal))
  (map-get? challenge-proofs { challenge-id: id, user: user })
)

(define-read-only (is-challenge-registered (title (string-ascii 100)))
  (is-some (map-get? challenges-by-title title))
)

(define-private (validate-title (title (string-ascii 100)))
  (if (and (> (len title) u0) (<= (len title) u100))
      (ok true)
      (err ERR-INVALID-TITLE))
)

(define-private (validate-description (desc (string-ascii 500)))
  (if (and (> (len desc) u0) (<= (len desc) u500))
      (ok true)
      (err ERR-INVALID-DESCRIPTION))
)

(define-private (validate-duration (duration uint))
  (if (> duration u0)
      (ok true)
      (err ERR-INVALID-DURATION))
)

(define-private (validate-stake-amount (amount uint))
  (if (>= amount u0)
      (ok true)
      (err ERR-INVALID-STAKE))
)

(define-private (validate-reward (reward uint))
  (if (>= reward u0)
      (ok true)
      (err ERR-INVALID-REWARD))
)

(define-private (validate-min-participants (min uint))
  (if (> min u0)
      (ok true)
      (err ERR-INVALID-MIN-PARTICIPANTS))
)

(define-private (validate-max-participants (max uint))
  (if (> max u0)
      (ok true)
      (err ERR-INVALID_MAX-PARTICIPANTS))
)

(define-private (validate-start-time (start uint))
  (if (>= start block-height)
      (ok true)
      (err ERR-INVALID_START-TIME))
)

(define-private (validate-difficulty (diff uint))
  (if (and (>= diff u1) (<= diff u10))
      (ok true)
      (err ERR-INVALID_DIFFICULTY))
)

(define-private (validate-category (cat (string-ascii 50)))
  (if (or (is-eq cat "running") (is-eq cat "strength") (is-eq cat "endurance"))
      (ok true)
      (err ERR-INVALID_CATEGORY))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p tx-sender))
      (ok true)
      (err ERR-INVALID_CREATOR))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (asserts! (is-none (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-challenges (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID_MAX_PARTICIPANTS))
    (asserts! (is-some (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set max-challenges new-max)
    (ok true)
  )
)

(define-public (set-creation-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID_STAKE))
    (asserts! (is-some (var-get authority-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set creation-fee new-fee)
    (ok true)
  )
)

(define-public (create-challenge
  (title (string-ascii 100))
  (description (string-ascii 500))
  (duration uint)
  (stake-amount uint)
  (reward uint)
  (min-participants uint)
  (max-participants uint)
  (difficulty uint)
  (category (string-ascii 50))
)
  (let (
        (next-id (var-get challenge-counter))
        (current-max (var-get max-challenges))
        (authority (var-get authority-contract))
        (start-time block-height)
        (end-time (+ start-time duration))
      )
    (asserts! (< next-id current-max) (err ERR-MAX_CHALLENGES_EXCEEDED))
    (try! (validate-title title))
    (try! (validate-description description))
    (try! (validate-duration duration))
    (try! (validate-stake-amount stake-amount))
    (try! (validate-reward reward))
    (try! (validate-min-participants min-participants))
    (try! (validate-max-participants max-participants))
    (try! (validate-difficulty difficulty))
    (try! (validate-category category))
    (try! (validate-start-time start-time))
    (asserts! (is-none (map-get? challenges-by-title title)) (err ERR-CHALLENGE_NOT_FOUND))
    (let ((authority-recipient (unwrap! authority (err ERR-NOT-AUTHORIZED))))
      (try! (stx-transfer? (var-get creation-fee) tx-sender authority-recipient))
    )
    (map-set challenges next-id
      {
        title: title,
        description: description,
        creator: tx-sender,
        start-time: start-time,
        end-time: end-time,
        stake-amount: stake-amount,
        reward-pool: reward,
        min-participants: min-participants,
        max-participants: max-participants,
        current-participants: u0,
        active: true,
        difficulty: difficulty,
        category: category,
        status: "open"
      }
    )
    (map-set challenges-by-title title next-id)
    (var-set challenge-counter (+ next-id u1))
    (print { event: "challenge-created", id: next-id })
    (ok next-id)
  )
)

(define-public (join-challenge (challenge-id uint) (stake uint))
  (let ((challenge (unwrap! (map-get? challenges challenge-id) (err ERR-CHALLENGE_NOT_FOUND))))
    (asserts! (get active challenge) (err ERR_CHALLENGE_NOT_ACTIVE))
    (asserts! (< block-height (get end-time challenge)) (err ERR_CHALLENGE_EXPIRED))
    (asserts! (>= stake (get stake-amount challenge)) (err ERR_STAKE_NOT_MET))
    (asserts! (< (get current-participants challenge) (get max-participants challenge)) (err ERR_CHALLENGE_FULL))
    (let ((user-status (default-to { joined: false, stake-paid: u0, proof-submitted: false, completed: false } (map-get? user-challenges { user: tx-sender, challenge-id: challenge-id }))))
      (asserts! (not (get joined user-status)) (err ERR_ALREADY_JOINED))
      (try! (stx-transfer? stake tx-sender (as-contract tx-sender)))
      (map-set user-challenges { user: tx-sender, challenge-id: challenge-id }
        { joined: true, stake-paid: stake, proof-submitted: false, completed: false }
      )
      (map-set challenges challenge-id
        (merge challenge { current-participants: (+ (get current-participants challenge) u1), reward-pool: (+ (get reward-pool challenge) stake) })
      )
      (print { event: "joined-challenge", id: challenge-id, user: tx-sender })
      (ok true)
    )
  )
)

(define-public (submit-proof (challenge-id uint) (proof-hash (buff 32)))
  (let ((challenge (unwrap! (map-get? challenges challenge-id) (err ERR_CHALLENGE_NOT_FOUND))))
    (asserts! (get active challenge) (err ERR_CHALLENGE_NOT_ACTIVE))
    (asserts! (>= block-height (get start-time challenge)) (err ERR_EARLY_SUBMISSION))
    (asserts! (< block-height (get end-time challenge)) (err ERR_CHALLENGE_EXPIRED))
    (let ((user-status (unwrap! (map-get? user-challenges { user: tx-sender, challenge-id: challenge-id }) (err ERR_NOT-JOINED))))
      (asserts! (get joined user-status) (err ERR_NOT_JOINED))
      (asserts! (not (get proof-submitted user-status)) (err ERR_PROOF_ALREADY_SUBMITTED))
      (map-set challenge-proofs { challenge-id: challenge-id, user: tx-sender }
        { proof-hash: proof-hash, submission-time: block-height }
      )
      (map-set user-challenges { user: tx-sender, challenge-id: challenge-id }
        (merge user-status { proof-submitted: true, completed: true })
      )
      (print { event: "proof-submitted", id: challenge-id, user: tx-sender })
      (ok true)
    )
  )
)

(define-public (deactivate-challenge (challenge-id uint))
  (let ((challenge (unwrap! (map-get? challenges challenge-id) (err ERR_CHALLENGE_NOT_FOUND))))
    (asserts! (is-eq (get creator challenge) tx-sender) (err ERR_NOT-AUTHORIZED))
    (asserts! (get active challenge) (err ERR_CHALLENGE_NOT_ACTIVE))
    (map-set challenges challenge-id
      (merge challenge { active: false, status: "deactivated" })
    )
    (print { event: "challenge-deactivated", id: challenge-id })
    (ok true)
  )
)

(define-public (get-challenge-count)
  (ok (var-get challenge-counter))
)

(define-public (check-challenge-existence (title (string-ascii 100)))
  (ok (is-challenge-registered title))
)