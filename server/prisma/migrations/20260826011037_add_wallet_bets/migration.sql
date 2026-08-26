-- CreateTable
CREATE TABLE "Txn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Txn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookingCode" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "stake" DECIMAL(12,2) NOT NULL,
    "totalOdds" DECIMAL(10,3) NOT NULL,
    "potential" DECIMAL(12,2) NOT NULL,
    "comboCount" INTEGER,
    "systemConfig" JSONB,
    "legs" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "payout" DECIMAL(12,2),
    "cashoutAmount" DECIMAL(12,2),
    "cashoutHistory" JSONB,
    "usedBonus" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "Bet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Txn_userId_createdAt_idx" ON "Txn"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Bet_userId_placedAt_idx" ON "Bet"("userId", "placedAt");

-- CreateIndex
CREATE INDEX "Bet_bookingCode_idx" ON "Bet"("bookingCode");

-- AddForeignKey
ALTER TABLE "Txn" ADD CONSTRAINT "Txn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
