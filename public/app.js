const app = document.querySelector("#app");
const REGISTRY_POLL_INTERVAL_MS = 4000;
const UPDATE_POLL_INTERVAL_MS = 10 * 60 * 1000;

const state = {
  deletingPageKey: null,
  expandedProjects: new Set(),
  expandedUsers: new Set(),
  iframeRefreshNonce: 0,
  pollTimer: null,
  registry: null,
  updateActionPending: null,
  updatePollTimer: null,
  updateStatus: null,
  updateSnoozeCommit: null
};

function escapeHtml(input) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  if (!value) {
    return "未记录";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function shortCommit(value) {
  return typeof value === "string" && value ? value.slice(0, 8) : "未记录";
}

function updateModeLabel(mode) {
  return mode === "auto" ? "自动更新" : "手动检查";
}

function pendingUpdateVisible(updateStatus) {
  return Boolean(
    updateStatus &&
      updateStatus.showBadge &&
      updateStatus.remoteCommit &&
      updateStatus.remoteCommit !== state.updateSnoozeCommit
  );
}

function updateWasDismissed(updateStatus) {
  return Boolean(
    updateStatus &&
      updateStatus.hasUpdate &&
      updateStatus.remoteCommit &&
      updateStatus.remoteCommit === updateStatus.dismissedRemoteCommit
  );
}

function updateWasSnoozed(updateStatus) {
  return Boolean(
    updateStatus &&
      updateStatus.hasUpdate &&
      updateStatus.showBadge &&
      updateStatus.remoteCommit &&
      updateStatus.remoteCommit === state.updateSnoozeCommit
  );
}

function parseRoute(pathname) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const segments = normalized.split("/").filter(Boolean).map(decodeURIComponent);

  if (segments.length === 0) {
    return { type: "home" };
  }

  if (segments[0] === "about" && segments.length === 1) {
    return { type: "about" };
  }

  if (segments[0] === "users" && segments[1] && !segments[2]) {
    return { type: "user", userId: segments[1] };
  }

  if (segments[0] === "users" && segments[1] && segments[2] === "pages" && segments[3]) {
    return { type: "page", userId: segments[1], pageId: segments[3] };
  }

  return { type: "not-found" };
}

function withCacheBust(url, nonce) {
  const absolute = new URL(url, window.location.origin);
  absolute.searchParams.set("_agentstage", String(nonce));
  return `${absolute.pathname}${absolute.search}`;
}

function deletePageApiUrl(userId, pageId) {
  return `/api/users/${encodeURIComponent(userId)}/pages/${encodeURIComponent(pageId)}`;
}

function pageTimestamp(page) {
  const value = page?.updatedAt ?? page?.createdAt;
  const time = new Date(value ?? 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function splitUserIdentity(userId) {
  return String(userId ?? "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function projectIdForUser(user) {
  return splitUserIdentity(user?.id)[0] ?? user?.id ?? "";
}

function nestedUserLabel(user) {
  const nameSegments = String(user?.name ?? "")
    .split(" / ")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (nameSegments.length > 1) {
    return nameSegments.slice(1).join(" / ");
  }

  const idSegments = splitUserIdentity(user?.id);
  return idSegments.length > 1 ? idSegments.slice(1).join(" / ") : user?.name ?? user?.id ?? "";
}

function sortedPages(user) {
  return [...(user?.pages ?? [])].sort((left, right) => {
    return pageTimestamp(right) - pageTimestamp(left) || left.title.localeCompare(right.title, "zh-Hans-CN");
  });
}

function latestPage(user) {
  return sortedPages(user)[0] ?? null;
}

function sortedUsers(registry) {
  return [...registry.users].sort((left, right) => {
    return pageTimestamp(latestPage(right)) - pageTimestamp(latestPage(left)) || left.name.localeCompare(right.name, "zh-Hans-CN");
  });
}

function latestTimestampForUser(user) {
  return pageTimestamp(latestPage(user));
}

function latestTargetRouteForUser(user) {
  const page = latestPage(user);
  return page?.route ?? user?.route ?? "/";
}

function buildProjectGroups(registry) {
  const groups = new Map();

  for (const user of registry.users) {
    const projectId = projectIdForUser(user);
    const identitySegments = splitUserIdentity(user.id);
    const existing = groups.get(projectId) ?? {
      projectId,
      projectName: identitySegments[0] ?? user.name ?? user.id,
      rootUser: null,
      childUsers: []
    };

    if (identitySegments.length <= 1) {
      existing.rootUser = user;
      existing.projectName = user.name ?? existing.projectName;
    } else {
      existing.childUsers.push(user);
    }

    groups.set(projectId, existing);
  }

  return [...groups.values()]
    .map((group) => {
      const childUsers = [...group.childUsers].sort((left, right) => {
        return latestTimestampForUser(right) - latestTimestampForUser(left) || nestedUserLabel(left).localeCompare(nestedUserLabel(right), "zh-Hans-CN");
      });
      const allUsers = [group.rootUser, ...childUsers].filter(Boolean);
      const latestUser = [...allUsers].sort((left, right) => {
        return latestTimestampForUser(right) - latestTimestampForUser(left) || (left.name ?? "").localeCompare(right.name ?? "", "zh-Hans-CN");
      })[0] ?? null;

      return {
        ...group,
        childUsers,
        allUsers,
        latestUser,
        totalPages: allUsers.reduce((count, user) => count + (user?.pages?.length ?? 0), 0),
        latestUpdatedAt: latestPage(latestUser)?.updatedAt ?? latestPage(latestUser)?.createdAt ?? registry.updatedAt,
        targetRoute: group.rootUser ? latestTargetRouteForUser(group.rootUser) : latestTargetRouteForUser(latestUser)
      };
    })
    .sort((left, right) => {
      return pageTimestamp(latestPage(right.latestUser)) - pageTimestamp(latestPage(left.latestUser)) || left.projectName.localeCompare(right.projectName, "zh-Hans-CN");
    });
}

function findRouteUser(registry, route) {
  if (!registry || !route.userId) {
    return null;
  }

  return registry.users.find((user) => user.id === route.userId) ?? null;
}

function findRoutePage(registry, route) {
  const user = findRouteUser(registry, route);
  if (!user || !route.pageId) {
    return { user: null, page: null };
  }

  return {
    user,
    page: user.pages.find((page) => page.id === route.pageId) ?? null
  };
}

function shouldRefreshIframe(previousRegistry, nextRegistry) {
  const route = parseRoute(window.location.pathname);
  if (route.type !== "page") {
    return false;
  }

  const previous = findRoutePage(previousRegistry, route);
  const next = findRoutePage(nextRegistry, route);
  if (!next.page) {
    return false;
  }

  if (!previous.page) {
    return true;
  }

  return next.page.updatedAt !== previous.page.updatedAt || next.page.liveUrl !== previous.page.liveUrl;
}

function navigate(href, { replace = false } = {}) {
  if (replace) {
    window.history.replaceState({}, "", href);
  } else {
    window.history.pushState({}, "", href);
  }

  renderCurrentRoute();
}

function renderCornerLink(label, href, { showBadge = false } = {}) {
  return `<a class="corner-link${showBadge ? " has-alert" : ""}" href="${escapeHtml(href)}" data-link>${escapeHtml(label)}</a>`;
}

function renderHardCornerLink(label, href) {
  return `<a class="corner-link" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function renderSubtleLink(label, href, { showBadge = false, className = "" } = {}) {
  return `<a class="subtle-link ${escapeHtml(className)}${showBadge ? " has-alert" : ""}" href="${escapeHtml(href)}" data-link>${escapeHtml(label)}</a>`;
}

function renderHome(registry) {
  const projectGroups = buildProjectGroups(registry);
  const userRows = projectGroups.length
    ? projectGroups
        .map((group) => {
          const rootPage = latestPage(group.rootUser);
          const groupCaption = rootPage?.title ?? latestPage(group.latestUser)?.title ?? "尚未挂载页面";
          const groupHeader = group.rootUser
            ? `
                <a class="space-row space-row-group" href="${escapeHtml(group.targetRoute)}" data-link>
                  <div class="space-main">
                    <div class="space-name">${escapeHtml(group.projectName)}</div>
                    <div class="space-caption">${escapeHtml(groupCaption)}</div>
                  </div>
                  <div class="space-meta">
                    <span>${group.totalPages} 页</span>
                    <span>${escapeHtml(formatDate(group.latestUpdatedAt))}</span>
                  </div>
                </a>
              `
            : `
                <div class="space-row space-row-group is-static">
                  <div class="space-main">
                    <div class="space-name">${escapeHtml(group.projectName)}</div>
                    <div class="space-caption">${escapeHtml(groupCaption)}</div>
                  </div>
                  <div class="space-meta">
                    <span>${group.totalPages} 页</span>
                    <span>${escapeHtml(formatDate(group.latestUpdatedAt))}</span>
                  </div>
                </div>
              `;

          const childRows = group.childUsers.length
            ? `
                <div class="space-subspaces">
                  ${group.childUsers
                    .map((user) => {
                      const lastPage = latestPage(user);
                      return `
                        <a class="space-row space-row-child" href="${escapeHtml(latestTargetRouteForUser(user))}" data-link>
                          <div class="space-main">
                            <div class="space-name">${escapeHtml(nestedUserLabel(user))}</div>
                            <div class="space-caption">${escapeHtml(lastPage?.title ?? "尚未挂载页面")}</div>
                          </div>
                          <div class="space-meta">
                            <span>${user.pageCount} 页</span>
                            <span>${escapeHtml(formatDate(lastPage?.updatedAt ?? registry.updatedAt))}</span>
                          </div>
                        </a>
                      `;
                    })
                    .join("")}
                </div>
              `
            : "";

          return `
            <section class="space-group fade-in">
              ${groupHeader}
              ${childRows}
            </section>
          `;
        })
        .join("")
    : `
        <section class="empty-card fade-in">
          <h2>还没有可浏览的 userSpace</h2>
          <p>其他 agent 完成页面注册后，这里会在刷新或自动同步后出现可选空间。</p>
        </section>
      `;

  app.innerHTML = `
    <main class="home-shell">
      ${renderCornerLink("关于本项目", "/about", { showBadge: Boolean(state.updateStatus?.showBadge) })}
      <section class="home-center fade-in">
        <div class="home-badge">AgentStage</div>
        <h1>选择要查看的 userSpace</h1>
        <p class="home-copy">这是给人类看的共享入口。选中一个空间后，会直接进入它最后一次挂载的页面。</p>
        <nav class="space-picker" aria-label="User spaces">
          ${userRows}
        </nav>
        <div class="home-footnote">当前已挂载 ${registry.users.reduce((count, user) => count + user.pages.length, 0)} 个页面，最近同步于 ${escapeHtml(formatDate(registry.updatedAt))}。</div>
      </section>
    </main>
  `;
}

function renderUpdatePanel() {
  const updateStatus = state.updateStatus;
  const pendingAction = state.updateActionPending;

  if (!updateStatus) {
    return `
      <section class="about-update-card">
        <div class="about-update-head">
          <div>
            <h2>更新检查</h2>
            <p>正在检查 GitHub 上的最新版本。</p>
          </div>
        </div>
      </section>
    `;
  }

  const hasPendingUpdate = pendingUpdateVisible(updateStatus);
  const isDismissed = updateWasDismissed(updateStatus);
  const isSnoozed = updateWasSnoozed(updateStatus);
  const summary = updateStatus.lastError
    ? "暂时无法完成更新检查。"
    : updateStatus.hasUpdate
      ? hasPendingUpdate
        ? "检测到一个新的可用版本。"
        : isDismissed
          ? "当前这个可用版本已经被你忽略，直到出现更高的新版本前不会再提示红点。"
          : isSnoozed
            ? "这个可用版本已被设为稍后提醒，本次打开期间不会再重复打扰。"
            : "检测到一个新的可用版本。"
      : "当前已经是最新版本。";
  const statusTone = updateStatus.lastError ? "is-warning" : hasPendingUpdate ? "is-alert" : "is-ok";

  return `
    <section class="about-update-card ${statusTone}">
      <div class="about-update-head">
        <div>
          <h2>更新检查</h2>
          <p>${escapeHtml(summary)}</p>
        </div>
        <div class="about-update-mode">${escapeHtml(updateModeLabel(updateStatus.mode))}</div>
      </div>

      <div class="about-update-grid">
        <div class="about-update-item">
          <span>本地版本</span>
          <strong>${escapeHtml(shortCommit(updateStatus.localCommit))}</strong>
        </div>
        <div class="about-update-item">
          <span>远端版本</span>
          <strong>${escapeHtml(shortCommit(updateStatus.remoteCommit))}</strong>
        </div>
        <div class="about-update-item">
          <span>最近检查</span>
          <strong>${escapeHtml(formatDate(updateStatus.checkedAt))}</strong>
        </div>
        <div class="about-update-item">
          <span>自动更新</span>
          <strong>${updateStatus.mode === "auto" ? "已启用" : "未启用"}</strong>
        </div>
      </div>

      ${
        updateStatus.lastError
          ? `<div class="about-update-note is-warning">${escapeHtml(updateStatus.lastError)}</div>`
          : ""
      }
      ${
        updateStatus.dirtyWorktree
          ? `<div class="about-update-note">当前工作区有未提交改动，自动更新会先暂停，避免把本机修改直接拉冲突。</div>`
          : ""
      }
      ${
        updateStatus.autoUpdatedAt
          ? `<div class="about-update-note">最近一次自动更新完成于 ${escapeHtml(formatDate(updateStatus.autoUpdatedAt))}。</div>`
          : ""
      }

      <div class="about-update-actions">
        <button type="button" class="chrome-button" data-action="check-updates" ${pendingAction === "check" ? "disabled" : ""}>
          ${pendingAction === "check" ? "检查中..." : "立即检查"}
        </button>
        <button type="button" class="chrome-button" data-action="enable-auto-update" ${pendingAction === "auto" ? "disabled" : ""}>
          ${pendingAction === "auto" ? "处理中..." : "自动更新"}
        </button>
        ${
          updateStatus.remoteCommit
            ? `<button type="button" class="chrome-button" data-action="dismiss-update" data-remote-commit="${escapeHtml(updateStatus.remoteCommit)}" ${pendingAction === "dismiss" ? "disabled" : ""}>
                ${pendingAction === "dismiss" ? "处理中..." : "不更新"}
              </button>`
            : ""
        }
        ${
          hasPendingUpdate
            ? `<button type="button" class="chrome-button" data-action="snooze-update" data-remote-commit="${escapeHtml(updateStatus.remoteCommit)}">稍后提醒</button>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderAbout(registry) {
  const userCount = registry.users.length;
  const pageCount = registry.users.reduce((count, user) => count + user.pages.length, 0);

  app.innerHTML = `
    <main class="about-shell">
      ${renderCornerLink("返回首页", "/")}
      <section class="about-card fade-in">
        <div class="home-badge">About AgentStage</div>
        <h1>这是一个给你浏览内容的入口</h1>
        <p class="about-lead">不同空间里的页面会被整理到这里。你不需要关心它们原本来自哪里，也不需要记住复杂路径，只要选中一个空间进入查看即可。</p>

        ${renderUpdatePanel()}

        <div class="about-grid">
          <article class="about-block">
            <h2>先选空间</h2>
            <p>首页只做一件事：帮你找到这次想看的那组内容。点进去后，会默认打开这个空间最近的一页。</p>
          </article>
          <article class="about-block">
            <h2>像文件夹一样看</h2>
            <p>左边的侧栏会按空间分组列出页面。展开后可以在同一组内容之间快速来回切换，不需要反复回首页。</p>
          </article>
          <article class="about-block">
            <h2>需要时再刷新</h2>
            <p>如果有人刚刚替你更新了内容，点一下页面左上方的“刷新当前视图”，就能看到最新版本。</p>
          </article>
          <article class="about-block">
            <h2>现在这里有</h2>
            <p>${userCount} 个空间，${pageCount} 个页面。最近一次整理时间是 ${escapeHtml(formatDate(registry.updatedAt))}。</p>
          </article>
        </div>

        <div class="about-note">
          <p>把这里当成一个安静的目录就好：选空间、看内容、在需要时刷新。至于这些页面是如何被接进来的，不需要你操心。</p>
        </div>
      </section>
    </main>
  `;
}

function pageShellKey(userId, pageId) {
  return `${userId}/${pageId}`;
}

function ensurePageShell() {
  let shell = app.querySelector(".viewer-shell-page");
  if (shell) {
    return shell;
  }

  app.innerHTML = `
    <main class="viewer-shell-page">
      <div class="workspace-layout">
        <aside class="finder-sidebar fade-in">
          <div class="sidebar-caption">User Spaces</div>
          <div class="tree-root"></div>
        </aside>

        <section class="viewer-region fade-in">
          <header class="viewer-topbar">
            <div class="viewer-actions">
              <a class="chrome-button" href="/" data-link>返回导航首页</a>
              <button type="button" class="chrome-button" data-action="refresh-current">刷新当前视图</button>
              <button type="button" class="chrome-button chrome-button-danger" data-action="delete-current-page">删除当前页面</button>
            </div>
            <div class="viewer-meta">
              <div class="viewer-context"></div>
              ${renderSubtleLink("关于", "/about", { showBadge: Boolean(state.updateStatus?.showBadge), className: "about-link" })}
            </div>
          </header>

          <div class="viewer-frame">
            <iframe loading="lazy" referrerpolicy="no-referrer"></iframe>
          </div>
        </section>
      </div>
    </main>
  `;

  shell = app.querySelector(".viewer-shell-page");
  return shell;
}

function updatePageShell(registry, user, currentPage) {
  state.expandedProjects.add(projectIdForUser(user));
  state.expandedUsers.add(user.id);
  ensurePageShell();

  const treeRoot = app.querySelector(".tree-root");
  if (treeRoot) {
    treeRoot.innerHTML = buildSidebarTree(registry, user.id, currentPage.id);
  }

  const viewerContext = app.querySelector(".viewer-context");
  if (viewerContext) {
    viewerContext.textContent = `${user.name} / ${currentPage.title}`;
  }

  const aboutLink = app.querySelector(".about-link");
  if (aboutLink) {
    aboutLink.classList.toggle("has-alert", Boolean(state.updateStatus?.showBadge));
  }

  const deleteButton = app.querySelector('[data-action="delete-current-page"]');
  if (deleteButton instanceof HTMLButtonElement) {
    const deleting = state.deletingPageKey === pageShellKey(user.id, currentPage.id);
    deleteButton.dataset.userId = user.id;
    deleteButton.dataset.pageId = currentPage.id;
    deleteButton.dataset.pageTitle = currentPage.title;
    deleteButton.disabled = deleting;
    deleteButton.textContent = deleting ? "删除中..." : "删除当前页面";
  }

  const iframe = app.querySelector(".viewer-frame iframe");
  if (!iframe) {
    return;
  }

  const nextPageKey = pageShellKey(user.id, currentPage.id);
  const nextRefreshNonce = String(state.iframeRefreshNonce);
  const nextSrc = withCacheBust(currentPage.liveUrl, state.iframeRefreshNonce);
  const shouldUpdateFrame =
    iframe.dataset.pageKey !== nextPageKey ||
    iframe.dataset.refreshNonce !== nextRefreshNonce ||
    iframe.getAttribute("src") !== nextSrc;

  iframe.title = currentPage.title;
  iframe.dataset.pageKey = nextPageKey;
  iframe.dataset.refreshNonce = nextRefreshNonce;

  if (shouldUpdateFrame) {
    iframe.setAttribute("src", nextSrc);
  }
}

function renderSidebarPageLinks(user, activeUserId, activePageId) {
  return sortedPages(user)
    .map((page) => {
      return `
        <a class="tree-page-link${user.id === activeUserId && page.id === activePageId ? " is-current" : ""}" href="${escapeHtml(page.route)}" data-link>
          ${escapeHtml(page.title)}
        </a>
      `;
    })
    .join("");
}

function renderSidebarChildGroup(user, activeUserId, activePageId) {
  const expanded = state.expandedUsers.has(user.id) || user.id === activeUserId;

  return `
    <section class="tree-subgroup${user.id === activeUserId ? " is-active-user" : ""}">
      <div class="tree-head tree-head-sub">
        <button
          type="button"
          class="tree-toggle"
          data-action="toggle-user"
          data-user-id="${escapeHtml(user.id)}"
          aria-expanded="${expanded ? "true" : "false"}"
          aria-label="${expanded ? "折叠" : "展开"} ${escapeHtml(user.name)}"
        >
          <span class="tree-caret">${expanded ? "▾" : "▸"}</span>
        </button>
        <a class="tree-user-link tree-user-link-sub" href="${escapeHtml(latestTargetRouteForUser(user))}" data-link>${escapeHtml(nestedUserLabel(user))}</a>
      </div>
      <div class="tree-pages${expanded ? " is-open" : ""}">
        ${expanded ? renderSidebarPageLinks(user, activeUserId, activePageId) : ""}
      </div>
    </section>
  `;
}

function buildSidebarTree(registry, activeUserId, activePageId) {
  const activeProjectId = splitUserIdentity(activeUserId)[0] ?? activeUserId;

  return buildProjectGroups(registry)
    .map((group) => {
      const expanded = state.expandedProjects.has(group.projectId) || group.projectId === activeProjectId;
      const projectLabelTag = group.rootUser
        ? `<a class="tree-user-link" href="${escapeHtml(group.targetRoute)}" data-link>${escapeHtml(group.projectName)}</a>`
        : `<span class="tree-user-link tree-user-label">${escapeHtml(group.projectName)}</span>`;

      return `
        <section class="tree-group${group.projectId === activeProjectId ? " is-active-project" : ""}">
          <div class="tree-head">
            <button
              type="button"
              class="tree-toggle"
              data-action="toggle-project"
              data-project-id="${escapeHtml(group.projectId)}"
              aria-expanded="${expanded ? "true" : "false"}"
              aria-label="${expanded ? "折叠" : "展开"} ${escapeHtml(group.projectName)}"
            >
              <span class="tree-caret">${expanded ? "▾" : "▸"}</span>
            </button>
            ${projectLabelTag}
          </div>
          <div class="tree-project-body${expanded ? " is-open" : ""}">
            ${
              expanded
                ? `
                    ${group.rootUser ? `<div class="tree-pages is-open">${renderSidebarPageLinks(group.rootUser, activeUserId, activePageId)}</div>` : ""}
                    ${group.childUsers.map((user) => renderSidebarChildGroup(user, activeUserId, activePageId)).join("")}
                  `
                : ""
            }
          </div>
        </section>
      `;
    })
    .join("");
}

function renderPage(registry, user, currentPage) {
  updatePageShell(registry, user, currentPage);
}

function renderNotFound() {
  app.innerHTML = `
    <main class="about-shell">
      ${renderCornerLink("返回首页", "/")}
      <section class="empty-card fade-in">
        <h2>没有找到这个页面</h2>
        <p>当前路径没有对应的 userSpace 或页面。返回导航首页重新选择。</p>
        <div class="empty-actions">
          <a class="primary-link-button" href="/" data-link>一键回到主页</a>
        </div>
      </section>
    </main>
  `;
}

async function loadRegistry() {
  const response = await fetch("/api/registry", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load registry: ${response.status}`);
  }

  return response.json();
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.detail || payload.error || `Request failed: ${response.status}`);
  }

  return payload;
}

async function loadUpdateStatus(force = false) {
  const suffix = force ? "?force=1" : "";
  return requestJson(`/api/update-status${suffix}`);
}

async function updatePreference(mode) {
  return requestJson("/api/update-preference", {
    method: "POST",
    body: JSON.stringify({ mode })
  });
}

async function dismissUpdate(remoteCommit) {
  return requestJson("/api/update-dismiss", {
    method: "POST",
    body: JSON.stringify({ remoteCommit })
  });
}

async function deleteDeployedPage(userId, pageId) {
  const response = await fetch(deletePageApiUrl(userId, pageId), {
    method: "DELETE"
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.detail || `Failed to delete page: ${response.status}`);
  }

  return payload;
}

async function syncUpdateStatus({ force = false, suppressRender = false } = {}) {
  try {
    const nextStatus = await loadUpdateStatus(force);
    const previousStatus = state.updateStatus;
    const changed = JSON.stringify(previousStatus) !== JSON.stringify(nextStatus);

    if (!previousStatus || previousStatus.remoteCommit !== nextStatus.remoteCommit) {
      state.updateSnoozeCommit = null;
    }

    state.updateStatus = nextStatus;

    if (!suppressRender && changed && state.registry) {
      renderCurrentRoute();
    }
  } catch (error) {
    const fallbackStatus = {
      mode: state.updateStatus?.mode ?? "manual",
      checkedAt: new Date().toISOString(),
      localCommit: state.updateStatus?.localCommit ?? null,
      remoteCommit: state.updateStatus?.remoteCommit ?? null,
      hasUpdate: state.updateStatus?.hasUpdate ?? false,
      showBadge: state.updateStatus?.showBadge ?? false,
      dirtyWorktree: state.updateStatus?.dirtyWorktree ?? false,
      autoUpdatedAt: state.updateStatus?.autoUpdatedAt ?? null,
      dismissedRemoteCommit: state.updateStatus?.dismissedRemoteCommit ?? null,
      lastActionAt: state.updateStatus?.lastActionAt ?? null,
      lastError: error instanceof Error ? error.message : String(error)
    };

    state.updateStatus = fallbackStatus;
    if (!suppressRender && state.registry) {
      renderCurrentRoute();
    }
  }
}

function renderCurrentRoute() {
  if (!state.registry) {
    return;
  }

  const route = parseRoute(window.location.pathname);

  if (route.type === "home") {
    renderHome(state.registry);
    return;
  }

  if (route.type === "about") {
    renderAbout(state.registry);
    return;
  }

  if (route.type === "user") {
    const user = state.registry.users.find((item) => item.id === route.userId);
    const lastPage = latestPage(user);

    if (!user || !lastPage) {
      renderNotFound();
      return;
    }

    navigate(lastPage.route, { replace: true });
    return;
  }

  if (route.type === "page") {
    const { user, page } = findRoutePage(state.registry, route);

    if (!user || !page) {
      renderNotFound();
      return;
    }

    renderPage(state.registry, user, page);
    return;
  }

  renderNotFound();
}

async function syncRegistry({ forceRender = false, suppressRender = false } = {}) {
  try {
    const nextRegistry = await loadRegistry();
    const previousRegistry = state.registry;
    const changed = !previousRegistry || previousRegistry.updatedAt !== nextRegistry.updatedAt;

    if (previousRegistry && shouldRefreshIframe(previousRegistry, nextRegistry)) {
      state.iframeRefreshNonce += 1;
    }

    state.registry = nextRegistry;

    if (!suppressRender && (forceRender || changed)) {
      renderCurrentRoute();
    }
  } catch (error) {
    app.innerHTML = `
      <main class="about-shell">
        ${renderHardCornerLink("返回首页", "/")}
        <section class="empty-card fade-in">
          <h2>加载失败</h2>
          <p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p>
          <div class="empty-actions">
            <button type="button" class="chrome-button" data-action="refresh-current">重试</button>
            <a class="primary-link-button" href="/">重新加载首页</a>
          </div>
        </section>
      </main>
    `;
  }
}

async function handleCurrentPageDelete(button) {
  const userId = button.dataset.userId;
  const pageId = button.dataset.pageId;
  const pageTitle = button.dataset.pageTitle ?? "当前页面";

  if (!userId || !pageId) {
    return;
  }

  const confirmed = window.confirm(`确认删除已部署页面“${pageTitle}”？\n\n这只会从 AgentStage 中卸载页面，并删除本仓库里的备份，不会删除源工作区文件。`);
  if (!confirmed) {
    return;
  }

  const deletingKey = pageShellKey(userId, pageId);
  state.deletingPageKey = deletingKey;
  renderCurrentRoute();

  try {
    const result = await deleteDeployedPage(userId, pageId);
    state.deletingPageKey = null;
    await syncRegistry({ suppressRender: true });
    navigate(result.nextRoute || "/", { replace: true });

    if (result.warning) {
      window.alert(`页面已卸载，但清理备份时出现提示：${result.warning}`);
    }
  } catch (error) {
    state.deletingPageKey = null;
    renderCurrentRoute();
    window.alert(error instanceof Error ? error.message : String(error));
  }
}

async function runUpdateAction(actionName, task) {
  state.updateActionPending = actionName;
  renderCurrentRoute();

  try {
    await task();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
  } finally {
    state.updateActionPending = null;
    renderCurrentRoute();
  }
}

async function handleCheckUpdates() {
  await runUpdateAction("check", async () => {
    await syncUpdateStatus({ force: true });
  });
}

async function handleEnableAutoUpdate() {
  await runUpdateAction("auto", async () => {
    state.updateSnoozeCommit = null;
    await updatePreference("auto");
    await syncUpdateStatus({ force: true });
  });
}

async function handleDismissUpdate(remoteCommit) {
  await runUpdateAction("dismiss", async () => {
    state.updateSnoozeCommit = null;
    await dismissUpdate(remoteCommit);
    await syncUpdateStatus({ force: true });
  });
}

function handleSnoozeUpdate(remoteCommit) {
  state.updateSnoozeCommit = remoteCommit || null;
  renderCurrentRoute();
}

function ensurePolling() {
  if (state.pollTimer) {
    return;
  }

  state.pollTimer = window.setInterval(() => {
    syncRegistry();
  }, REGISTRY_POLL_INTERVAL_MS);
}

function ensureUpdatePolling() {
  if (state.updatePollTimer) {
    return;
  }

  state.updatePollTimer = window.setInterval(() => {
    syncUpdateStatus();
  }, UPDATE_POLL_INTERVAL_MS);
}

document.addEventListener("click", (event) => {
  const actionTarget = event.target instanceof HTMLElement ? event.target.closest("[data-action]") : null;
  if (actionTarget) {
    const action = actionTarget.getAttribute("data-action");

    if (action === "refresh-current") {
      state.iframeRefreshNonce += 1;
      syncRegistry({ forceRender: true });
      return;
    }

    if (action === "toggle-user") {
      const userId = actionTarget.getAttribute("data-user-id");
      if (userId) {
        if (state.expandedUsers.has(userId)) {
          state.expandedUsers.delete(userId);
        } else {
          state.expandedUsers.add(userId);
        }
        renderCurrentRoute();
      }
      return;
    }

    if (action === "toggle-project") {
      const projectId = actionTarget.getAttribute("data-project-id");
      if (projectId) {
        if (state.expandedProjects.has(projectId)) {
          state.expandedProjects.delete(projectId);
        } else {
          state.expandedProjects.add(projectId);
        }
        renderCurrentRoute();
      }
      return;
    }

    if (action === "delete-current-page" && actionTarget instanceof HTMLButtonElement) {
      handleCurrentPageDelete(actionTarget);
      return;
    }

    if (action === "check-updates") {
      handleCheckUpdates();
      return;
    }

    if (action === "enable-auto-update") {
      handleEnableAutoUpdate();
      return;
    }

    if (action === "dismiss-update") {
      handleDismissUpdate(actionTarget.getAttribute("data-remote-commit"));
      return;
    }

    if (action === "snooze-update") {
      handleSnoozeUpdate(actionTarget.getAttribute("data-remote-commit"));
      return;
    }
  }

  const link = event.target instanceof HTMLElement ? event.target.closest("[data-link]") : null;
  if (!link) {
    return;
  }

  const href = link.getAttribute("href");
  if (!href || href.startsWith("http")) {
    return;
  }

  event.preventDefault();
  navigate(href);
});

window.addEventListener("popstate", () => {
  renderCurrentRoute();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    syncRegistry({ forceRender: true });
    syncUpdateStatus();
  }
});

ensurePolling();
ensureUpdatePolling();
syncRegistry({ forceRender: true });
syncUpdateStatus({ force: true });
