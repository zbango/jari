import { onceUIStyle } from "@agent-desktop/ui/theme";
import { defaultStyleOptions, schemes, useStyle, useTheme } from "@once-ui-system/core";
import type { NeutralColor, Schemes } from "@once-ui-system/core";
import { Background } from "@once-ui-system/core/components/Background";
import { Button } from "@once-ui-system/core/components/Button";
import { Card } from "@once-ui-system/core/components/Card";
import { Column } from "@once-ui-system/core/components/Column";
import { Grid } from "@once-ui-system/core/components/Grid";
import { Heading } from "@once-ui-system/core/components/Heading";
import { Icon } from "@once-ui-system/core/components/Icon";
import { Row } from "@once-ui-system/core/components/Row";
import { Select } from "@once-ui-system/core/components/Select";
import { StyleScope } from "@once-ui-system/core/components/StyleScope";
import { Tag } from "@once-ui-system/core/components/Tag";
import { Text } from "@once-ui-system/core/components/Text";
import { ThemeSwitcher } from "@once-ui-system/core/components/ThemeSwitcher";
import { useState } from "react";

const { theme: defaultTheme, ...appStyle } = onceUIStyle;
const styleDefaults = { ...appStyle, density: defaultStyleOptions.density };

type ThemeStyle = ReturnType<typeof useStyle>;
type StyleKey =
  | "brand"
  | "accent"
  | "neutral"
  | "solid"
  | "solidStyle"
  | "border"
  | "surface"
  | "density"
  | "scaling"
  | "transition";

const choices = {
  brand: schemes as Schemes[],
  accent: schemes as Schemes[],
  neutral: ["sand", "gray", "slate", "rose", "mint", "dusk"] satisfies NeutralColor[],
  solid: ["color", "contrast", "inverse"],
  solidStyle: ["flat", "plastic", "glow"],
  border: ["rounded", "playful", "conservative", "sharp"],
  surface: ["filled", "translucent"],
  density: ["compact", "normal", "spacious"],
  scaling: ["90", "95", "100", "105", "110"],
  transition: ["all", "micro", "macro", "none"],
} satisfies { [Key in StyleKey]: readonly ThemeStyle[Key][] };

const labels: Record<StyleKey, string> = {
  brand: "Brand",
  accent: "Accent",
  neutral: "Neutral",
  solid: "Button colors",
  solidStyle: "Button finish",
  border: "Corners",
  surface: "Surfaces",
  density: "Density",
  scaling: "Interface scale",
  transition: "Motion",
};

const groups = [
  { heading: "Palette", fields: ["brand", "accent", "neutral"] },
  { heading: "Components", fields: ["solid", "solidStyle", "border", "surface"] },
  { heading: "Layout and motion", fields: ["density", "scaling", "transition"] },
] as const satisfies readonly { heading: string; fields: readonly StyleKey[] }[];

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="theme-swatch"
      style={{ background: `var(--scheme-${color}-500, var(--brand-solid-medium))` }}
    />
  );
}

export function ThemeSettings() {
  const style = useStyle();
  const { theme, setTheme } = useTheme();
  const [invertPreview, setInvertPreview] = useState(false);
  const isDefault =
    theme === defaultTheme &&
    groups.every(({ fields }) => fields.every((key) => style[key] === styleDefaults[key]));

  return (
    <Column fillWidth gap="16">
      <Row fillWidth gap="12" wrap vertical="center" horizontal="between">
        <Column gap="4">
          <Heading as="h2" textVariant="display-strong-xs">
            Appearance
          </Heading>
          <Text textVariant="body-default-s" onBackground="neutral-weak">
            Try Once UI’s built-in styles. Changes apply live and save on this device.
          </Text>
        </Column>
        <Button
          type="button"
          variant="secondary"
          prefixIcon="refresh"
          size="s"
          disabled={isDefault}
          onClick={() => {
            style.setStyle(styleDefaults);
            setTheme(defaultTheme);
          }}
        >
          Reset theme
        </Button>
      </Row>

      <Card
        fillWidth
        direction="column"
        gap="16"
        padding="16"
        radius="l"
        background="page"
        position="relative"
        overflow="hidden"
      >
        <Background
          aria-hidden
          position="absolute"
          top="0"
          left="0"
          dots={{ display: true, opacity: 20, size: "12" }}
          gradient={{
            display: true,
            colorStart: "accent-background-strong",
            opacity: 50,
            x: "100%",
            y: "0%",
            width: "95%",
            height: "150%",
          }}
          mask={{ x: "100%", y: "0%", radius: "90%" }}
        />
        <Row
          position="relative"
          zIndex={1}
          fillWidth
          wrap
          gap="8"
          horizontal="between"
          vertical="center"
        >
          <Heading as="h3" textVariant="heading-strong-s">
            Live preview
          </Heading>
          <ThemeSwitcher aria-label="Theme" semantics="radio" />
        </Row>
        <StyleScope
          config={{ theme: invertPreview ? "invert" : undefined }}
          fillWidth
          position="relative"
          zIndex={1}
          radius="m"
        >
          <Card
            fillWidth
            position="relative"
            padding="16"
            gap="16"
            wrap
            horizontal="between"
            vertical="center"
            radius="m"
            background="surface"
          >
            <Row gap="12" vertical="center">
              <Row padding="8" radius="m" background="brand-alpha-weak" border="brand-alpha-medium">
                <Icon name="code" size="m" onBackground="brand-strong" decorative />
              </Row>
              <Column gap="2">
                <Text textVariant="label-default-s" onBackground="neutral-weak">
                  Milestone
                </Text>
                <Text textVariant="heading-strong-s">Build</Text>
              </Column>
            </Row>
            <Row gap="8" vertical="center" wrap>
              <Tag label="Ready" prefixIcon="time" tone="accent" />
              <Button
                type="button"
                size="s"
                aria-pressed={invertPreview}
                onClick={() => setInvertPreview(!invertPreview)}
              >
                Invert preview
              </Button>
            </Row>
          </Card>
        </StyleScope>
      </Card>

      {groups.map(({ heading, fields }) => (
        <Card
          key={heading}
          fillWidth
          direction="column"
          gap="12"
          padding="16"
          radius="l"
          background="surface"
        >
          <Heading as="h3" textVariant="heading-strong-s">
            {heading}
          </Heading>
          <Grid fillWidth columns={fields.length === 4 ? 2 : 3} gap="12" s={{ columns: 1 }}>
            {fields.map((key) => {
              const palette = key === "brand" || key === "accent" || key === "neutral";
              const options = choices[key].map((value) => ({
                value,
                label: key === "scaling" ? `${value}%` : value[0]!.toUpperCase() + value.slice(1),
                prefix: palette ? <Swatch color={value} /> : undefined,
              }));

              return (
                <Select
                  key={key}
                  id={`theme-${key}`}
                  label={labels[key]}
                  size="s"
                  fillWidth
                  value={style[key]}
                  options={options}
                  prefix={palette ? <Swatch color={style[key]} /> : undefined}
                  onValueChange={(value) => {
                    if (options.some((option) => option.value === value))
                      style.setStyle({ [key]: value });
                  }}
                />
              );
            })}
          </Grid>
        </Card>
      ))}
    </Column>
  );
}
