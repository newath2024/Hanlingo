import { extractUnit } from "./extract";
import { generateRuntimeUnit } from "./generate";
import { validateCurriculum } from "./validate";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function getFlagValue(flag: string) {
  const index = process.argv.indexOf(flag);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

async function run() {
  const command = process.argv[2];
  const unitId = getFlagValue("--unit") ?? "1";
  const localOnly = hasFlag("--local-only");

  if (command === "extract") {
    const result = await extractUnit({
      cwd: process.cwd(),
      emitReviewedSeed: hasFlag("--emit-reviewed-seed"),
      unitId,
    });
    console.log(`Raw draft: ${result.rawPath}`);
    console.log(`Extracted draft source: ${result.extractedPath}`);
    return;
  }

  if (command === "generate") {
    const result = await generateRuntimeUnit({
      unitId,
      localOnly,
    });
    console.log(`Generated runtime unit: ${result.runtimePath}`);
    return;
  }

  if (command === "validate") {
    const result = await validateCurriculum({ unitId });
    console.log(`Validated curriculum artifacts for unit ${unitId}.`);
    console.log(result);
    return;
  }

  if (command === "pilot") {
    const extractResult = await extractUnit({
      cwd: process.cwd(),
      emitReviewedSeed: true,
      unitId,
    });
    const generateResult = await generateRuntimeUnit({
      unitId,
      localOnly,
    });
    await validateCurriculum({ unitId });

    console.log(`Pilot complete for unit ${unitId}.`);
    console.log(`Raw draft: ${extractResult.rawPath}`);
    console.log(`Draft source: ${extractResult.extractedPath}`);
    console.log(`Runtime unit: ${generateResult.runtimePath}`);
    return;
  }

  throw new Error(
    "Unknown command. Use one of: extract, generate, validate, pilot.",
  );
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
