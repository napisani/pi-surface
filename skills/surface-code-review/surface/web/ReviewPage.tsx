// The code review page: Files, Review, Walkthrough, Requests and Comments tabs.
import type { CodeViewHandle } from "@pierre/diffs/react";
import { Activity, useMemo, useRef, type ReactNode } from "react";
import { ErrorBoundary } from "../../../../web/kit/ErrorBoundary.tsx";
import type { LineItemRef } from "../../../../web/kit/diffItems.ts";
import { setHashValues, useHashChoice } from "../../../../web/kit/hooks/useHashState.ts";
import { useJumpTo, type JumpTarget } from "../../../../web/kit/hooks/useJumpTo.ts";
import { Markdown } from "../../../../web/kit/Markdown.tsx";
import { PageHeader, tabCount, type HeaderTab } from "../../../../web/kit/PageHeader.tsx";
import { Badge } from "../../../../web/kit/primitives/Badge.tsx";
import { Banner } from "../../../../web/kit/primitives/Banner.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { PageMain } from "../../../../web/kit/shell.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import type { ReviewState } from "../state.ts";
import { CommentsTab } from "./CommentsTab.tsx";
import { FilesTab } from "./FilesTab.tsx";
import { usePost, useReadReview, useReview } from "./hooks.ts";
import { noteCounts, visibleFiles } from "./lineItems.ts";
import { NavContext, type ReviewNav } from "./nav.ts";
import css from "./ReviewPage.module.css";
import { RequestsTab } from "./RequestsTab.tsx";
import { ReviewSendControl } from "./ReviewSendControl.tsx";
import { ReviewTab } from "./ReviewTab.tsx";
import { collapsedStore, filterStore } from "./ui.ts";
import { useViewed } from "./useViewed.ts";
import { WalkthroughTab } from "./WalkthroughTab.tsx";

type Tab = "files" | "review" | "walkthrough" | "requests" | "comments";
const TABS: readonly Tab[] = ["files", "review", "walkthrough", "requests", "comments"];

const selectState = (s: ReviewState) => s;

function tabsOf(s: ReviewState): HeaderTab<Tab>[] {
  const openRequests = s.requests.filter((r) => r.status === "pending" || r.status === "needs-input").length;
  const openComments = s.comments.filter((c) => c.status === "draft" || c.status === "failed").length + s.questions.filter((q) => !q.resolved).length;
  return [
    { id: "files", label: "Files", count: String(s.files.length) },
    { id: "review", label: "Review", count: tabCount(s.review.findings.filter((f) => !f.dismissed).length, s.review.status === "running") },
    { id: "walkthrough", label: "Walkthrough", count: tabCount(s.walkthrough.steps.length, s.walkthrough.status === "running") },
    ...(s.target?.mode === "live" ? [{ id: "requests" as const, label: "Requests", count: tabCount(openRequests) }] : []),
    { id: "comments", label: s.pr ? "Comments" : "Questions", count: tabCount(openComments) },
  ];
}

function Title({ state }: { state: ReviewState }) {
  const { target, pr } = state;
  if (!target) {
    return null;
  }
  if (pr) {
    return (
      <>
        <a className={css.title} href={pr.url} target="_blank" rel="noreferrer">
          <Text tone="faint">
            {pr.owner}/{pr.repo}
          </Text>{" "}
          #{pr.number} {pr.title}
        </a>
        {pr.isDraft ? <Badge>draft</Badge> : null}
        <Text tone="faint" mono small>
          {pr.baseRef} ← {pr.headRef} · {target.mode === "live" ? "your working tree" : pr.headSha.slice(0, 8)} · @{pr.author}
        </Text>
      </>
    );
  }
  return (
    <>
      <span className={css.title}>{target.title}</span>
      <Text tone="faint" mono small>
        vs {target.baseRef} ({target.mergeBase.slice(0, 8)}) · {target.worktree.split("/").slice(-2).join("/")}
      </Text>
    </>
  );
}

function TabPanel({ name, visible, children }: { name: string; visible: boolean; children: ReactNode }) {
  return (
    <Activity mode={visible ? "visible" : "hidden"}>
      <ErrorBoundary name={name}>{children}</ErrorBoundary>
    </Activity>
  );
}

export function ReviewPage() {
  const post = usePost();
  const readState = useReadReview();
  const state = useReview(selectState);
  const refreshing = usePending("refresh");
  const tabs = useMemo(() => tabsOf(state), [state]);
  const [tabParam, setTab] = useHashChoice<Tab>("tab", "files", TABS);
  const tab = tabs.some((t) => t.id === tabParam) ? tabParam : "files";
  const viewer = useRef<CodeViewHandle<LineItemRef, undefined>>(null);
  const jumpLines = useJumpTo(viewer);
  const [viewed, setViewed] = useViewed();

  const nav = useMemo<ReviewNav>(
    () => ({
      jumpTo(target: JumpTarget) {
        const current = readState();
        const file = current.files.find((f) => f.path === target.path);
        if (!file) {
          return;
        }
        const filters = filterStore.get();
        if (!visibleFiles(current, filters, viewed, noteCounts(current)).includes(file)) {
          filterStore.set({ text: "", categories: new Set([...filters.categories, file.category]), onlyNoted: false, hideViewed: false });
        }
        collapsedStore.update((prev) => (prev.has(file.path) ? new Set([...prev].filter((p) => p !== file.path)) : prev));
        if (viewed.has(file.path)) {
          setViewed(file.path, false);
        }
        setHashValues({ tab: "files" });
        jumpLines(target);
      },
      openFinding(id: string) {
        setHashValues({ tab: "review", finding: id });
      },
    }),
    [readState, viewed, setViewed, jumpLines],
  );

  const target = state.target!;
  const refreshTip = target.mode === "live" ? `Reload the diff from your working tree${state.pr ? " and GitHub's comments" : ""}` : "Load new GitHub comments and check for new commits";
  return (
    <NavContext value={nav}>
      <PageHeader
        brand="code review"
        title={<Title state={state} />}
        actions={
          <>
            <Button size="small" title={refreshTip} disabled={refreshing} onClick={() => void post({ type: "refresh" }, "refresh")}>
              ↻ Refresh
            </Button>
            <ReviewSendControl />
          </>
        }
        tabs={tabs}
        tab={tab}
        onTab={setTab}
      />
      <PageMain>
        {state.pr?.remoteHeadSha ? (
          <Banner tone="warn">
            The PR has new commits (head {state.pr.remoteHeadSha.slice(0, 8)}). This page still shows {state.pr.headSha.slice(0, 8)}, and new comments attach there. Ask the agent to reload the PR.
          </Banner>
        ) : null}
        {state.pr?.body.trim() && tab === "files" ? (
          <details className={css.prBody}>
            <summary>Description</summary>
            <Markdown text={state.pr.body} />
          </details>
        ) : null}
        {/* CodeView builds its viewer in a callback ref, so the Files tab is hidden with CSS rather than an Activity. */}
        <section hidden={tab !== "files"}>
          <ErrorBoundary name="files">
            <FilesTab viewer={viewer} />
          </ErrorBoundary>
        </section>
        <TabPanel name="review" visible={tab === "review"}>
          <ReviewTab />
        </TabPanel>
        <TabPanel name="walkthrough" visible={tab === "walkthrough"}>
          <WalkthroughTab />
        </TabPanel>
        {target.mode === "live" ? (
          <TabPanel name="requests" visible={tab === "requests"}>
            <RequestsTab />
          </TabPanel>
        ) : null}
        <TabPanel name="comments" visible={tab === "comments"}>
          <CommentsTab />
        </TabPanel>
      </PageMain>
    </NavContext>
  );
}
