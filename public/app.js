const app = document.querySelector("#app");
const REGISTRY_POLL_INTERVAL_MS = 4000;

const state = {
  deletingPageKey: null,
  expandedUsers: new Set(),
  iframeRefreshNonce: 0,
  pollTimer: null,
  registry: null
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

function renderCornerLink(label, href) {
  return `<a class="corner-link" href="${escapeHtml(href)}" data-link>${escapeHtml(label)}</a>`;
}

function renderHardCornerLink(label, href) {
  return `<a class="corner-link" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function renderHome(registry) {
  const users = sortedUsers(registry);
  const userRows = users.length
    ? users
        .map((user) => {
          const lastPage = latestPage(user);
          const targetRoute = lastPage?.route ?? user.route;

          return `
            <a class="space-row fade-in" href="${escapeHtml(targetRoute)}" data-link>
              <div class="space-main">
                <div class="space-name">${escapeHtml(user.name)}</div>
                <div class="space-caption">${escapeHtml(lastPage?.title ?? "尚未挂载页面")}</div>
              </div>
              <div class="space-meta">
                <span>${user.pageCount} 页</span>
                <span>${escapeHtml(formatDate(lastPage?.updatedAt ?? registry.updatedAt))}</span>
              </div>
            </a>
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
      ${renderCornerLink("关于本项目", "/about")}
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
              <a class="subtle-link" href="/about" data-link>关于</a>
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

function buildSidebarTree(registry, activeUserId, activePageId) {
  return sortedUsers(registry)
    .map((user) => {
      const pages = sortedPages(user);
      const expanded = state.expandedUsers.has(user.id) || user.id === activeUserId;
      const userTarget = latestPage(user)?.route ?? user.route;

      return `
        <section class="tree-group${user.id === activeUserId ? " is-active-user" : ""}">
          <div class="tree-head">
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
            <a class="tree-user-link" href="${escapeHtml(userTarget)}" data-link>${escapeHtml(user.name)}</a>
          </div>
          <div class="tree-pages${expanded ? " is-open" : ""}">
            ${
              expanded
                ? pages
                    .map((page) => {
                      return `
                        <a class="tree-page-link${page.id === activePageId ? " is-current" : ""}" href="${escapeHtml(page.route)}" data-link>
                          ${escapeHtml(page.title)}
                        </a>
                      `;
                    })
                    .join("")
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

function ensurePolling() {
  if (state.pollTimer) {
    return;
  }

  state.pollTimer = window.setInterval(() => {
    syncRegistry();
  }, REGISTRY_POLL_INTERVAL_MS);
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

    if (action === "delete-current-page" && actionTarget instanceof HTMLButtonElement) {
      handleCurrentPageDelete(actionTarget);
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
  }
});

ensurePolling();
syncRegistry({ forceRender: true });
