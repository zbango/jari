import type { AtlassianDocumentNode } from "@agent-desktop/shared";
import { Column } from "@once-ui-system/core/components/Column";
import { Heading } from "@once-ui-system/core/components/Heading";
import { InlineCode } from "@once-ui-system/core/components/InlineCode";
import { Line } from "@once-ui-system/core/components/Line";
import { List } from "@once-ui-system/core/components/List";
import { ListItem } from "@once-ui-system/core/components/ListItem";
import { SmartLink } from "@once-ui-system/core/components/SmartLink";
import { Text } from "@once-ui-system/core/components/Text";
import { Fragment } from "react";
import type { ReactNode } from "react";

export function JiraLink({
  href,
  baseUrl,
  openLink,
  children,
}: {
  href?: string;
  baseUrl: string;
  openLink(url: string): void;
  children: ReactNode;
}) {
  const url = href ? URL.parse(href, baseUrl) : null;
  if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    return children;
  }
  return (
    <SmartLink
      href={url.href}
      marginX="0"
      onClick={(event) => {
        event.preventDefault();
        openLink(url.href);
      }}
    >
      {children}
    </SmartLink>
  );
}

export function AtlassianDocument({
  document,
  text,
  baseUrl,
  openLink,
}: {
  document?: AtlassianDocumentNode;
  text: string;
  baseUrl: string;
  openLink(url: string): void;
}) {
  function link(href: string | undefined, content: ReactNode) {
    return (
      <JiraLink href={href} baseUrl={baseUrl} openLink={openLink}>
        {content}
      </JiraLink>
    );
  }

  function childrenOf(node: AtlassianDocumentNode) {
    return node.content?.map((child, index) => <Fragment key={index}>{render(child)}</Fragment>);
  }

  function render(node: AtlassianDocumentNode): ReactNode {
    switch (node.type) {
      case "text": {
        return (node.marks ?? []).reduce<ReactNode>((content, mark) => {
          switch (mark.type) {
            case "strong":
              return <strong>{content}</strong>;
            case "em":
              return <em>{content}</em>;
            case "strike":
              return <s>{content}</s>;
            case "underline":
              return <u>{content}</u>;
            case "code":
              return <InlineCode>{content}</InlineCode>;
            case "link":
              return link(mark.attrs?.href, content);
            default:
              return content;
          }
        }, node.text);
      }
      case "paragraph":
        return (
          <Text as="p" textVariant="body-default-s" className="request-body">
            {childrenOf(node) ?? <br />}
          </Text>
        );
      case "heading": {
        const as = node.attrs?.level === 1 ? "h4" : node.attrs?.level === 2 ? "h5" : "h6";
        return (
          <Heading as={as} textVariant={as === "h4" ? "heading-strong-s" : "heading-strong-xs"}>
            {childrenOf(node)}
          </Heading>
        );
      }
      case "bulletList":
      case "orderedList":
        return (
          <List as={node.type === "bulletList" ? "ul" : "ol"} start={node.attrs?.order} gap="4">
            {childrenOf(node)}
          </List>
        );
      case "listItem":
        return <ListItem textVariant="body-default-s">{childrenOf(node)}</ListItem>;
      case "blockquote":
      case "panel":
        return (
          <Column
            as={node.type === "blockquote" ? "blockquote" : "aside"}
            padding="12"
            gap="8"
            background="surface"
            border
            radius="m"
          >
            {childrenOf(node)}
          </Column>
        );
      case "codeBlock":
        return (
          <Column
            as="pre"
            margin="0"
            padding="12"
            background="surface"
            border
            radius="m"
            overflowX="auto"
            tabIndex={0}
          >
            <Text as="code" textVariant="code-default-s">
              {node.content
                ?.map((line) => line.text ?? (line.type === "hardBreak" ? "\n" : ""))
                .join("")}
            </Text>
          </Column>
        );
      case "table":
        return (
          <Column overflowX="auto" border radius="m">
            <table>
              <tbody>{childrenOf(node)}</tbody>
            </table>
          </Column>
        );
      case "tableRow":
        return <tr>{childrenOf(node)}</tr>;
      case "tableCell":
      case "tableHeader": {
        const Cell = node.type === "tableHeader" ? "th" : "td";
        return (
          <Cell colSpan={node.attrs?.colspan} rowSpan={node.attrs?.rowspan}>
            <Column padding="8" gap="4" border>
              {childrenOf(node)}
            </Column>
          </Cell>
        );
      }
      case "rule":
        return <Line />;
      case "hardBreak":
        return <br />;
      case "inlineCard":
      case "blockCard":
        return link(node.attrs?.url, node.attrs?.url);
      default:
        return node.text ?? node.attrs?.text ?? node.attrs?.alt ?? childrenOf(node);
    }
  }

  if (!document?.content?.length) {
    return (
      <Text as="p" textVariant="body-default-s" className="request-body">
        {text}
      </Text>
    );
  }
  return (
    <Column minWidth="0" gap="8">
      {childrenOf(document)}
    </Column>
  );
}
