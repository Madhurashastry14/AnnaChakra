import {
  CheckboxField,
  FormGrid,
  SelectInput,
  TextInput,
  TriStateField,
} from "../ui/Form.jsx";
import { labelFor } from "../../utils/format.js";

const STORAGE_METHODS = ["HOT_HOLDING", "REFRIGERATED", "FROZEN", "AMBIENT", "UNKNOWN"];

export default function SafetyFields({ values, onChange, idPrefix = "safety" }) {
  const set = (field) => (value) => onChange(field, value);

  return (
    <section className="k-safety-fields">
      <div className="k-form-section-heading">
        <h2>Food safety information</h2>
        <p>
          Leave anything you do not know as “Unknown / not recorded”. The backend screens
          redistribution eligibility from these facts — do not enter estimates as measurements.
        </p>
      </div>

      <FormGrid columns={2}>
        <TriStateField
          label="Was this food never served?"
          id={`${idPrefix}-unserved`}
          value={values.unserved_confirmed}
          onChange={set("unserved_confirmed")}
          hint="Confirms the food is unserved surplus rather than plate waste."
          yesLabel="Yes, never served"
          noLabel="No, it was served"
        />
        <SelectInput
          label="Storage method"
          id={`${idPrefix}-storage-method`}
          value={values.storage_method}
          onChange={(event) => onChange("storage_method", event.target.value)}
          placeholder="Unknown / not recorded"
          options={STORAGE_METHODS.map((method) => ({ value: method, label: labelFor(method) }))}
          hint="How the food was held after preparation."
        />
        <TextInput
          label="Preparation timestamp"
          id={`${idPrefix}-prepared-at`}
          type="datetime-local"
          value={values.prepared_at}
          onChange={(event) => onChange("prepared_at", event.target.value)}
          hint="When the food finished cooking, if known. Cannot be in the future."
        />
        <TextInput
          label="Storage temperature (°C)"
          id={`${idPrefix}-temperature`}
          type="number"
          step="0.1"
          value={values.storage_temperature}
          onChange={(event) => onChange("storage_temperature", event.target.value)}
          placeholder="Leave blank if not measured"
        />
        <TextInput
          label="Temperature measured at"
          id={`${idPrefix}-measured-at`}
          type="datetime-local"
          value={values.temperature_measured_at}
          onChange={(event) => onChange("temperature_measured_at", event.target.value)}
        />
        <TextInput
          label="Temperature history started at"
          id={`${idPrefix}-history-start`}
          type="datetime-local"
          value={values.temperature_history_started_at}
          onChange={(event) => onChange("temperature_history_started_at", event.target.value)}
        />
        <TextInput
          label="Minimum recorded temperature (°C)"
          id={`${idPrefix}-min`}
          type="number"
          step="0.1"
          value={values.temperature_history_min_c}
          onChange={(event) => onChange("temperature_history_min_c", event.target.value)}
        />
        <TextInput
          label="Maximum recorded temperature (°C)"
          id={`${idPrefix}-max`}
          type="number"
          step="0.1"
          value={values.temperature_history_max_c}
          onChange={(event) => onChange("temperature_history_max_c", event.target.value)}
        />
        <TextInput
          label="Temperature history reference"
          id={`${idPrefix}-reference`}
          value={values.temperature_history_reference}
          onChange={(event) => onChange("temperature_history_reference", event.target.value)}
          maxLength={255}
          placeholder="e.g. fridge logger ID or record sheet"
          hint="A reference to where the temperature history is documented."
        />
        <TextInput
          label="Time outside controlled storage (minutes)"
          id={`${idPrefix}-uncontrolled`}
          type="number"
          min="0"
          max="525600"
          step="1"
          value={values.uncontrolled_minutes}
          onChange={(event) => onChange("uncontrolled_minutes", event.target.value)}
          placeholder="Leave blank if not known"
        />
        <TextInput
          label="Discard deadline"
          id={`${idPrefix}-discard`}
          type="datetime-local"
          value={values.discard_at}
          onChange={(event) => onChange("discard_at", event.target.value)}
          hint="The time after which this food must be discarded, if known."
        />
        <TriStateField
          label="Was controlled storage verified?"
          id={`${idPrefix}-storage-verified`}
          value={values.storage_verified}
          onChange={set("storage_verified")}
          yesLabel="Yes, verified"
          noLabel="No"
        />
        <TriStateField
          label="Is contamination suspected?"
          id={`${idPrefix}-contamination`}
          value={values.contamination_suspected}
          onChange={set("contamination_suspected")}
          yesLabel="Yes, suspected"
          noLabel="No"
        />
      </FormGrid>

      <CheckboxField
        label="I confirm staff followed safe handling procedures"
        description="Only check this if the kitchen can stand behind it. It is not checked automatically."
        id={`${idPrefix}-handling`}
        checked={values.safe_handling_confirmed}
        onChange={(event) => onChange("safe_handling_confirmed", event.target.checked)}
      />
    </section>
  );
}
