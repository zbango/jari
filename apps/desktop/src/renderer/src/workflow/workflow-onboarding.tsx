import { Button } from "@once-ui-system/core/components/Button";
import { Card } from "@once-ui-system/core/components/Card";
import { Column } from "@once-ui-system/core/components/Column";
import { Grid } from "@once-ui-system/core/components/Grid";
import { Heading } from "@once-ui-system/core/components/Heading";
import { Icon } from "@once-ui-system/core/components/Icon";
import { Row } from "@once-ui-system/core/components/Row";
import { Text } from "@once-ui-system/core/components/Text";
import { MatrixFx } from "@once-ui-system/fx";
import type { Ref } from "react";

// MatrixFx resolves color tokens when the canvas starts, before the theme may be ready.
const matrixColors = ["#7a63eb"];
const matrixRipple = { type: "ripple", duration: 4000, intensity: 15, repeat: true } as const;

const stages = [
  {
    title: "Choose a work item",
    icon: "document",
    description:
      "Pick a workspace folder, then choose a Jira issue or start with a simulated issue.",
  },
  {
    title: "Review the plan",
    icon: "layers",
    description:
      "Attach Company Knowledge and review the proposed tasks, code changes, and verification steps.",
  },
  {
    title: "Build and review",
    icon: "code",
    description:
      "Start Build after approving the plan. Review each task’s changes before the provider moves on.",
  },
] as const;

export function WorkflowOnboarding({
  newWorkflowButton,
  onNewWorkflow,
}: {
  newWorkflowButton: Ref<HTMLButtonElement>;
  onNewWorkflow(): void;
}) {
  return (
    <Column
      as="section"
      aria-label="Workflow onboarding"
      data-workflow-onboarding
      className="workflow-empty"
      position="relative"
      overflow="hidden"
    >
      <MatrixFx
        aria-hidden="true"
        position="absolute"
        top="0"
        left="0"
        fill
        pointerEvents="none"
        opacity={60}
        colors={matrixColors}
        size={3}
        spacing={11}
        bulge={matrixRipple}
        fps={24}
      />
      <Column
        position="absolute"
        top="0"
        left="0"
        fill
        horizontal="center"
        padding="l"
        overflowY="auto"
      >
        <Column maxWidth="62rem" fillWidth gap="24" marginY="auto">
          <Column
            position="relative"
            overflow="hidden"
            background="neutral-alpha-weak"
            border
            radius="xl"
            padding="48"
            s={{ padding: "24" }}
          >
            <Column gap="16" maxWidth="32rem">
              <Heading as="h2" textVariant="display-strong-s" wrap="balance">
                From work item to implementation
              </Heading>
              <Text as="p" textVariant="body-default-m" onBackground="neutral-medium">
                Plan and build with Codex or Claude Code in a local workspace. Pick up saved
                workflows from the sidebar.
              </Text>
              <Row paddingTop="8">
                <Button
                  ref={newWorkflowButton}
                  type="button"
                  prefixIcon="plus"
                  aria-haspopup="dialog"
                  data-new-workflow
                  onClick={onNewWorkflow}
                >
                  New workflow
                </Button>
              </Row>
            </Column>
          </Column>
          <Grid minColumnWidth={204} gap="12">
            {stages.map(({ title, icon, description }) => (
              <Card
                key={title}
                fillWidth
                fillHeight
                padding="20"
                background="surface"
                border
                radius="l"
              >
                <Column gap="12">
                  <Row fitWidth padding="8" background="brand-alpha-weak" radius="m">
                    <Icon name={icon} size="m" onBackground="brand-medium" decorative />
                  </Row>
                  <Heading as="h3" textVariant="heading-strong-s">
                    {title}
                  </Heading>
                  <Text as="p" textVariant="body-default-s" onBackground="neutral-weak">
                    {description}
                  </Text>
                </Column>
              </Card>
            ))}
          </Grid>
        </Column>
      </Column>
    </Column>
  );
}
