import test from "node:test";
import assert from "node:assert/strict";
import {
  getBuildUpgradeConfirmationCopy,
  getDevelopmentUpgradePresentation,
} from "@/components/play-v2/utils/developmentLabels";

test("target level 1 presentation returns single detached house narrative and sprite", () => {
  const presentation = getDevelopmentUpgradePresentation(1);

  assert.equal(presentation.label, "Single Detached House");
  assert.match(presentation.narrativeSentence1, /single detached home/i);
  assert.match(presentation.narrativeSentence2, /residential presence/i);
  assert.equal(presentation.spriteSrc, "/assets/house-1.svg");
});

test("cash confirmation wording distinguishes build vs upgrade", () => {
  const buildCopy = getBuildUpgradeConfirmationCopy({
    currentLevel: 0,
    targetLabel: "Single Detached House",
    formattedCost: "$400",
    hasCashCost: true,
  });
  const upgradeCopy = getBuildUpgradeConfirmationCopy({
    currentLevel: 2,
    targetLabel: "Apartment Building",
    formattedCost: "$600",
    hasCashCost: true,
  });

  assert.equal(buildCopy.question, "Build a Single Detached House for $400?");
  assert.equal(upgradeCopy.question, "Upgrade to an Apartment Building for $600?");
});

test("voucher confirmation wording preserves voucher type semantics", () => {
  const buildVoucherCopy = getBuildUpgradeConfirmationCopy({
    currentLevel: 0,
    targetLabel: "Single Detached House",
    useConstructionVoucher: "BUILD",
    formattedCost: "$400",
    hasCashCost: true,
  });
  const upgradeVoucherCopy = getBuildUpgradeConfirmationCopy({
    currentLevel: 3,
    targetLabel: "Commercial-Residential Building",
    useConstructionVoucher: "UPGRADE",
    formattedCost: "$600",
    hasCashCost: true,
  });

  assert.equal(
    buildVoucherCopy.question,
    "Build a Single Detached House using voucher?",
  );
  assert.equal(
    upgradeVoucherCopy.question,
    "Upgrade to a Commercial-Residential Building using voucher?",
  );
});
