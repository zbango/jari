import type { PlanReview } from "@agent-desktop/shared";
import { Accordion } from "@once-ui-system/core/components/Accordion";
import { Column } from "@once-ui-system/core/components/Column";
import { Heading } from "@once-ui-system/core/components/Heading";
import { InlineCode } from "@once-ui-system/core/components/InlineCode";
import { List } from "@once-ui-system/core/components/List";
import { ListItem } from "@once-ui-system/core/components/ListItem";
import { Row } from "@once-ui-system/core/components/Row";
import { Tag } from "@once-ui-system/core/components/Tag";
import { Text } from "@once-ui-system/core/components/Text";
import { Timeline } from "@once-ui-system/core/components/Timeline";
import { ProposedDiff } from "./proposed-diff";

function ReviewList({
  title,
  items,
  ordered = false,
}: {
  title: string;
  items: string[];
  ordered?: boolean;
}) {
  if (!items.length) return null;
  return (
    <Column gap="4">
      <Heading as="h4" textVariant="heading-strong-s">
        {title}
      </Heading>
      <List as={ordered ? "ol" : "ul"} gap="4">
        {items.map((item, index) => (
          <ListItem key={index}>{item}</ListItem>
        ))}
      </List>
    </Column>
  );
}

const fileLabels = { create: "Create", update: "Update", delete: "Delete" } as const;
const fileTones = { create: "success", update: "info", delete: "danger" } as const;

export function PlanReviewSections({ review, text }: { review: PlanReview; text: string }) {
  return (
    <Column gap="20">
      <Column gap="8">
        <Heading as="h3" textVariant="heading-strong-m">
          Proposal
        </Heading>
        <Text as="p">{review.proposal}</Text>
      </Column>
      {(review.findings.length > 0 || review.considerations.length > 0) && (
        <Accordion title="Brainstorming" defaultOpen contentProps={{ gap: "12" }}>
          <ReviewList title="Findings" items={review.findings} />
          <ReviewList title="Considerations and trade-offs" items={review.considerations} />
        </Accordion>
      )}
      {review.steps.length > 0 && (
        <Column gap="8">
          <Heading as="h3" textVariant="heading-strong-m">
            Implementation steps
          </Heading>
          <Timeline
            size="s"
            items={review.steps.map(({ title, detail, files }, index) => ({
              marker: index + 1,
              label: title,
              description: detail,
              children: files.length > 0 && (
                <Row gap="4" wrap>
                  {files.map((path, fileIndex) => (
                    <InlineCode key={fileIndex}>{path}</InlineCode>
                  ))}
                </Row>
              ),
            }))}
          />
        </Column>
      )}
      {review.files.length > 0 && (
        <Column gap="8">
          <Heading as="h3" textVariant="heading-strong-m">
            Proposed file changes
          </Heading>
          {review.files.map(({ path, action, summary, diff }, index) => (
            <Accordion
              key={index}
              title={
                <Row gap="8" wrap vertical="center">
                  <Tag tone={fileTones[action]} size="s" label={fileLabels[action]} />
                  <InlineCode>{path}</InlineCode>
                </Row>
              }
              contentProps={{ gap: "12" }}
            >
              <Text as="p">{summary}</Text>
              {diff.trim() ? (
                <ProposedDiff diff={diff} path={path} />
              ) : (
                <Text onBackground="neutral-weak" textVariant="body-default-s">
                  Exact code changes are still to be determined.
                </Text>
              )}
            </Accordion>
          ))}
        </Column>
      )}
      {(review.reproduction.length > 0 || review.verification.length > 0) && (
        <Accordion title="Reproduction and verification" defaultOpen contentProps={{ gap: "12" }}>
          <ReviewList title="Reproduce the current behavior" items={review.reproduction} ordered />
          <ReviewList title="Verify the proposed changes" items={review.verification} ordered />
        </Accordion>
      )}
      <Accordion title="Provider plan" titleVariant="label-default-s">
        <Text as="p" className="request-body">
          {text}
        </Text>
      </Accordion>
    </Column>
  );
}
