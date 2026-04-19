import test from "node:test";
import assert from "node:assert/strict";
import {
  getBuildUpgradeConfirmationCopy,
  getDevelopmentUpgradePresentation,
} from "@/components/play-v2/utils/developmentLabels";

test("target level 1 presentation returns single detached house narrative and sprite", () => {
  const presentation = getDevelopmentUpgradePresentation(1);

  assert.equal(presentation.label, "single detached house");
  assert.match(presentation.narrative, /single detached home/i);
  assert.equal(presentation.spriteSrc, "/assets/house-1.svg");
});

test("cash confirmation wording distinguishes build vs upgrade", () => {
  const buildCopy = getBuildUpgradeConfirmationCopy({
    currentLevel: 0,
    targetLabel: "single detached house",
    formattedCost: "$400",
    hasCashCost: true,
  });
  const upgradeCopy = getBuildUpgradeConfirmationCopy({
    currentLevel: 2,
    targetLabel: "apartment building",
    formattedCost: "$600",
    hasCashCost: true,
  });

  assert.equal(buildCopy.question, "Build a single detached house for $400?");
  assert.equal(upgradeCopy.question, "Upgrade to an apartment building for $600?");
  assert.equal(buildCopy.paymentSummary, "Payment: Cash ($400)");
});

test("voucher confirmation wording preserves voucher type semantics", () => {
  const buildVoucherCopy = getBuildUpgradeConfirmationCopy({
    currentLevel: 0,
    targetLabel: "single detached house",
    useConstructionVoucher: "BUILD",
    formattedCost: "$400",
    hasCashCost: true,
  });
  const upgradeVoucherCopy = getBuildUpgradeConfirmationCopy({
    currentLevel: 3,
    targetLabel: "commercial-residential building",
    useConstructionVoucher: "UPGRADE",
    formattedCost: "$600",
    hasCashCost: true,
  });

  assert.equal(
    buildVoucherCopy.question,
    "Build a single detached house using voucher?",
  );
  assert.equal(
    upgradeVoucherCopy.question,
    "Upgrade to a commercial-residential building using voucher?",
  );
  assert.equal(buildVoucherCopy.paymentSummary, "Payment: Build voucher");
  assert.equal(upgradeVoucherCopy.paymentSummary, "Payment: Upgrade voucher");
});
