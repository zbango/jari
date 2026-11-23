import {
  Mascot,
  MASCOT_DESIGN_DEFAULTS,
  mascotDesignProps,
  parseMascotDesign,
  useToast,
} from "@once-ui-system/core";
import type { MascotDesign } from "@once-ui-system/core";
import { Button } from "@once-ui-system/core/components/Button";
import { Column } from "@once-ui-system/core/components/Column";
import { Grid } from "@once-ui-system/core/components/Grid";
import { Heading } from "@once-ui-system/core/components/Heading";
import { Row } from "@once-ui-system/core/components/Row";
import { Select } from "@once-ui-system/core/components/Select";
import { Slider } from "@once-ui-system/core/components/Slider";
import { Text } from "@once-ui-system/core/components/Text";
import { defaultMascotDesign } from "./workflow/provider-activity";

const fields = [
  { key: "color", label: "Color", values: ["brand", "accent", "neutral"] },
  { key: "surface", label: "Finish", values: ["glossy", "matte", "flat", "glass"] },
  { key: "eyes", label: "Eyes", values: ["tile", "pill", "round", "wide", "dot"] },
  { key: "mouth", label: "Mouth", values: ["none", "smile", "dot", "line"] },
  { key: "personality", label: "Movement", values: ["default", "calm", "bouncy"] },
] as const;

export function MascotSettings({
  design,
  onChange,
}: {
  design: MascotDesign;
  onChange(design: MascotDesign): void;
}) {
  const { addToast } = useToast();

  function save(next: MascotDesign) {
    try {
      onChange(next);
    } catch {
      addToast({ tone: "danger", message: "The mascot preferences could not be saved." });
    }
  }

  return (
    <Column gap="20" fillWidth>
      <Column gap="8">
        <Heading as="h2" textVariant="display-strong-xs">
          Mascot
        </Heading>
        <Text textVariant="body-default-s" onBackground="neutral-weak">
          Choose how the mascot looks and moves during provider activity. Changes save
          automatically.
        </Text>
      </Column>
      <Row center fillWidth padding="16" background="neutral-alpha-weak" radius="l">
        <Mascot
          {...mascotDesignProps(design)}
          state="thinking"
          lookAt="center"
          aria-label="Mascot preview"
          size={96}
        />
      </Row>
      <Grid minColumnWidth={176} gap="12">
        {fields.map(({ key, label, values }) => {
          const value = design[key];
          return (
            <Select
              key={key}
              id={`mascot-${key}`}
              label={label}
              value={typeof value === "string" ? value : MASCOT_DESIGN_DEFAULTS[key]}
              options={values.map((option) => ({
                value: option,
                label: option.charAt(0).toUpperCase() + option.slice(1),
              }))}
              onValueChange={(option) => save(parseMascotDesign({ ...design, [key]: option }))}
            />
          );
        })}
        <Slider
          label="Roundness"
          min={0}
          max={100}
          step={5}
          value={(design.roundness ?? MASCOT_DESIGN_DEFAULTS.roundness) * 100}
          onValueChange={(roundness) => save({ ...design, roundness: roundness / 100 })}
        />
      </Grid>
      <Row>
        <Button type="button" variant="secondary" onClick={() => save(defaultMascotDesign)}>
          Reset mascot
        </Button>
      </Row>
    </Column>
  );
}
