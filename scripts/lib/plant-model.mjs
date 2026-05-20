import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLANT_MODEL_PATH = path.join(__dirname, "..", "..", "examples", "plant_model.example.json");
const ACTUATOR_ENUM_PATH = path.join(__dirname, "..", "..", "schemas", "actuator-enum.json");

export function loadDefaultPlantModel() {
  return JSON.parse(fs.readFileSync(PLANT_MODEL_PATH, "utf8"));
}

export function loadActuatorManifest() {
  return JSON.parse(fs.readFileSync(ACTUATOR_ENUM_PATH, "utf8"));
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

export function plantStateIds(plantModel = loadDefaultPlantModel()) {
  return new Set((plantModel.state_variables ?? []).map((item) => item.id));
}

export function reviewPlantModel({
  plantModel = loadDefaultPlantModel(),
  actuatorManifest = loadActuatorManifest()
} = {}) {
  const violations = [];
  const warnings = [];
  const stateIds = uniqueStrings((plantModel.state_variables ?? []).map((item) => item.id));
  const duplicateStateIds = stateIds.length === (plantModel.state_variables ?? []).length
    ? []
    : (plantModel.state_variables ?? [])
        .map((item) => item.id)
        .filter((id, index, values) => values.indexOf(id) !== index);
  const mappedActuators = new Set((plantModel.control_inputs ?? []).flatMap((input) => input.allowed_actuators ?? []));
  const knownActuators = new Set(actuatorManifest.actuators ?? []);
  const missingActuators = [...knownActuators].filter((actuator) => !mappedActuators.has(actuator)).sort();
  const unknownActuators = [...mappedActuators].filter((actuator) => !knownActuators.has(actuator)).sort();

  if (plantModel.schema_version !== "misa.plant_model.v1") {
    violations.push("plant model schema_version must be misa.plant_model.v1");
  }
  if ((plantModel.safety_boundary?.production_authority ?? true) !== false) {
    violations.push("plant model must keep production_authority false");
  }
  if (duplicateStateIds.length > 0) {
    violations.push(`duplicate plant state variables: ${uniqueStrings(duplicateStateIds).join(", ")}`);
  }
  if (stateIds.length < 5) {
    warnings.push("plant model should name enough state variables to cover memory, skill, public safety, provider health, and user feedback");
  }
  if (missingActuators.length > 0) {
    violations.push(`plant model does not map actuators: ${missingActuators.join(", ")}`);
  }
  if (unknownActuators.length > 0) {
    violations.push(`plant model maps unknown actuators: ${unknownActuators.join(", ")}`);
  }

  return {
    ok: violations.length === 0,
    plant_id: plantModel.plant_id,
    state_variable_count: stateIds.length,
    control_input_count: plantModel.control_inputs?.length ?? 0,
    mapped_actuator_count: mappedActuators.size,
    missing_actuators: missingActuators,
    unknown_actuators: unknownActuators,
    violations,
    warnings
  };
}
