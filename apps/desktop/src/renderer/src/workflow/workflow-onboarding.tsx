import { Button } from "@once-ui-system/core/components/Button";
import { Card } from "@once-ui-system/core/components/Card";
import { Column } from "@once-ui-system/core/components/Column";
import { Grid } from "@once-ui-system/core/components/Grid";
import { Heading } from "@once-ui-system/core/components/Heading";
import { Icon } from "@once-ui-system/core/components/Icon";
import { Row } from "@once-ui-system/core/components/Row";
import { Text } from "@once-ui-system/core/components/Text";
import type { Ref } from "react";

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
      "Attach Company Knowledge, answer provider questions, and review the steps, proposed diffs, and verification checks.",
  },
  {
    title: "Build after approval",
    icon: "code",
    description:
      "Approve the plan, then start Build to let the selected provider implement it in your workspace.",
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
      horizontal="center"
      padding="l"
      overflowY="auto"
    >
      <Column maxWidth="62rem" fillWidth gap="24" marginY="auto">
        <Column gap="12" maxWidth="34rem">
          <Heading as="h2" textVariant="display-strong-xs">
            From work item to implementation
          </Heading>
          <Text as="p" textVariant="body-default-m" onBackground="neutral-weak">
            Use Codex or Claude Code to plan and build in a local workspace. Your workflows are
            saved here so you can return to them later.
          </Text>
          <Row paddingTop="4">
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
        <Grid columns={3} m={{ columns: 2 }} s={{ columns: 1 }} gap="12">
          {stages.map(({ title, icon, description }) => (
            <Card
              key={title}
              fillWidth
              fillHeight
              padding="16"
              background="surface"
              border
              radius="l"
            >
              <Column gap="8">
                <Icon name={icon} size="m" onBackground="brand-medium" decorative />
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
  );
}
