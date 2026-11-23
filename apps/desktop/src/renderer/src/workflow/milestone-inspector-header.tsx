import { Background } from "@once-ui-system/core/components/Background";
import { Column } from "@once-ui-system/core/components/Column";
import { Icon } from "@once-ui-system/core/components/Icon";
import { Row } from "@once-ui-system/core/components/Row";
import { Tag } from "@once-ui-system/core/components/Tag";
import { Text } from "@once-ui-system/core/components/Text";
import type { ComponentProps } from "react";
import type { WorkflowStatusKind } from "./stages";

type IconName = ComponentProps<typeof Icon>["name"];
const tones = {
  waiting: "neutral",
  running: "brand",
  review: "warning",
  saved: "success",
  failed: "danger",
  blocked: "warning",
} as const satisfies Record<WorkflowStatusKind, ComponentProps<typeof Tag>["tone"]>;

export function MilestoneInspectorHeader({
  title,
  caption,
  icon,
  status,
}: {
  title: string;
  caption?: string;
  icon: IconName;
  status?: { label: string; kind: WorkflowStatusKind; icon: IconName };
}) {
  return (
    <Column
      fillWidth
      position="relative"
      overflow="hidden"
      radius="l"
      border="neutral-alpha-weak"
      padding="16"
    >
      <Background
        aria-hidden
        position="absolute"
        top="0"
        left="0"
        dots={{ display: true, opacity: 20, size: "8" }}
        gradient={{ display: true, x: "95%", y: "0%", width: "85%", height: "180%", opacity: 40 }}
        mask={{ x: "100%", y: "0%", radius: "90%", feather: 55 }}
      />
      <Row position="relative" zIndex={1} fillWidth vertical="center" gap="12">
        <Row
          className="milestone-inspector-icon"
          padding="12"
          radius="m"
          border="brand-alpha-medium"
          background="brand-alpha-weak"
        >
          <Icon name={icon} onBackground="brand-medium" size="m" decorative />
        </Row>
        <Column flex={1} minWidth="0" gap="2">
          {caption && (
            <Text as="p" textVariant="label-default-s" onBackground="neutral-weak">
              {caption}
            </Text>
          )}
          <h2 className="milestone-inspector-title">{title}</h2>
        </Column>
        {status && (
          <Tag
            role="status"
            size="s"
            tone={tones[status.kind]}
            prefixIcon={status.icon}
            dot={false}
            label={status.label}
          />
        )}
      </Row>
    </Column>
  );
}
