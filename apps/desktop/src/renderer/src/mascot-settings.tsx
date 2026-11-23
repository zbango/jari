import {
  Mascot,
  MASCOT_ACCESSORIES,
  MASCOT_DESIGN_DEFAULTS,
  MASCOT_DESIGN_RANGES,
  mascotDesignProps,
  parseMascotDesign,
  useToast,
} from "@once-ui-system/core";
import type { MascotDesign, MascotState } from "@once-ui-system/core";
import { Button } from "@once-ui-system/core/components/Button";
import { Card } from "@once-ui-system/core/components/Card";
import { Column } from "@once-ui-system/core/components/Column";
import { Grid } from "@once-ui-system/core/components/Grid";
import { Heading } from "@once-ui-system/core/components/Heading";
import { Row } from "@once-ui-system/core/components/Row";
import { Select } from "@once-ui-system/core/components/Select";
import { Slider } from "@once-ui-system/core/components/Slider";
import { Switch } from "@once-ui-system/core/components/Switch";
import { Text } from "@once-ui-system/core/components/Text";
import { useState, type Ref } from "react";
import { defaultMascotDesign } from "./workflow/provider-activity";

const fields = [
  { key: "color", label: "Color", values: ["brand", "accent", "neutral"] },
  { key: "surface", label: "Finish", values: ["glossy", "matte", "flat", "glass"] },
  { key: "eyes", label: "Eyes", values: ["tile", "pill", "round", "wide", "dot"] },
  { key: "mouth", label: "Mouth", values: ["none", "smile", "dot", "line"] },
  { key: "personality", label: "Movement", values: ["default", "calm", "bouncy"] },
] as const;

const sliders = [
  { key: "roundness", label: "Roundness" },
  { key: "aspect", label: "Body width" },
  { key: "eyeSize", label: "Eye size" },
  { key: "eyeSpacing", label: "Eye spacing" },
  { key: "eyeHeight", label: "Eye height" },
] as const;

const previewStates: MascotState[] = ["idle", "listening", "thinking", "speaking", "sleeping"];

function options(values: readonly string[]) {
  return values.map((value) => ({
    value,
    label: (value.charAt(0).toUpperCase() + value.slice(1)).replace(/([a-z])([A-Z])/g, "$1 $2"),
  }));
}

export function MascotSettings({
  design,
  guideButton,
  onChange,
  onStartGuide,
}: {
  design: MascotDesign;
  guideButton: Ref<HTMLButtonElement>;
  onChange(design: MascotDesign): void;
  onStartGuide(): void;
}) {
  const { addToast } = useToast();
  const [preview, setPreview] = useState<MascotState>("thinking");

  function save(next: unknown) {
    try {
      onChange(parseMascotDesign(next));
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
          Customize the mascot for the app guide and provider activity. Design changes save
          automatically.
        </Text>
      </Column>
      <Card background="surface" border radius="xl" padding="24" fillWidth>
        <Column gap="16" fillWidth>
          <Row center fillWidth padding="24" background="brand-alpha-weak" radius="l">
            <Mascot
              {...mascotDesignProps(design)}
              state={preview}
              lookAt="pointer"
              poke
              aria-label="Mascot preview"
              size={104}
            />
          </Row>
          <Grid minColumnWidth={176} gap="12">
            <Select
              id="mascot-preview-state"
              label="Preview activity"
              value={preview}
              options={options(previewStates)}
              onValueChange={(value) => {
                const state = previewStates.find((state) => state === value);
                if (state) setPreview(state);
              }}
            />
            <Select
              id="mascot-working"
              label="While working"
              value={design.working ?? "default"}
              options={[
                { value: "default", label: "Mascot" },
                { value: "cube", label: "3D cube" },
                { value: "d20", label: "3D die" },
              ]}
              onValueChange={(working) => save({ ...design, working })}
            />
          </Grid>
          <Row gap="8" wrap>
            <Button
              ref={guideButton}
              type="button"
              prefixIcon="help"
              aria-haspopup="dialog"
              onClick={onStartGuide}
            >
              Try the app guide
            </Button>
            <Button type="button" variant="secondary" onClick={() => save(defaultMascotDesign)}>
              Reset mascot
            </Button>
          </Row>
        </Column>
      </Card>
      <Card background="surface" border radius="xl" padding="24" fillWidth>
        <Column gap="16" fillWidth>
          <Heading as="h3" textVariant="heading-strong-s">
            Design
          </Heading>
          <Grid minColumnWidth={176} gap="12">
            {fields.map(({ key, label, values }) => {
              const value = design[key];
              return (
                <Select
                  key={key}
                  id={`mascot-${key}`}
                  label={label}
                  value={typeof value === "string" ? value : MASCOT_DESIGN_DEFAULTS[key]}
                  options={options(values)}
                  onValueChange={(option) => save({ ...design, [key]: option })}
                />
              );
            })}
            <Select
              id="mascot-accessories"
              label="Accessories"
              value={design.accessory ?? []}
              options={options(MASCOT_ACCESSORIES)}
              multiple
              onValueChange={(accessory) => save({ ...design, accessory })}
            />
          </Grid>
          <Grid minColumnWidth={176} gap="16">
            {sliders.map(({ key, label }) => {
              const [min, max] = MASCOT_DESIGN_RANGES[key];
              return (
                <Slider
                  key={key}
                  label={label}
                  min={min * 100}
                  max={max * 100}
                  step={5}
                  value={(design[key] ?? MASCOT_DESIGN_DEFAULTS[key]) * 100}
                  onValueChange={(value) => save({ ...design, [key]: value / 100 })}
                />
              );
            })}
          </Grid>
          <Row gap="24" wrap>
            <Switch
              id="mascot-brows"
              label="Brows"
              checked={design.brows ?? false}
              onCheckedChange={(brows) => save({ ...design, brows })}
            />
            <Switch
              id="mascot-cheeks"
              label="Cheeks"
              checked={design.cheeks ?? false}
              onCheckedChange={(cheeks) => save({ ...design, cheeks })}
            />
          </Row>
        </Column>
      </Card>
    </Column>
  );
}
