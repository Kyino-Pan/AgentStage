const app = document.querySelector("#app");
const REGISTRY_POLL_INTERVAL_MS = 4000;

const state = {
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
  const pageCount = registry.users.reduce((count, user) => count + user.pages.length, 0);

  app.innerHTML = `
    <main class="about-shell">
      ${renderCornerLink("返回首页", "/")}
      <section class="about-card fade-in">
        <div class="home-badge">About AgentStage</div>
        <h1>面向人类浏览的共享页面门户</h1>
        <p class="about-lead">AgentStage 把多个 agent 在不同工作区里生成的静态页面挂到同一个本地入口下，统一提供导航、侧边栏、热更新和备份。</p>

        <div class="about-grid">
          <article class="about-block">
            <h2>项目职责</h2>
            <p>统一挂载页面，而不是替代页面工程本身。真实 HTML / CSS / JS / 图片尽量继续保留在源工作区。</p>
          </article>
          <article class="about-block">
            <h2>热更新</h2>
            <p>服务支持运行中的页面注册更新；源工作区内容发生变化时，刷新当前视图即可看到最新结果。</p>
          </article>
          <article class="about-block">
            <h2>展示约束</h2>
            <p>导航和包装层尽量克制，避免抢占嵌入页面的空间；默认约束由 skill 描述文件维护，可由用户追加定义。</p>
          </article>
          <article class="about-block">
            <h2>当前状态</h2>
            <p>${registry.users.length} 个 userSpace，${pageCount} 个页面。最近一次同步时间是 ${escapeHtml(formatDate(registry.updatedAt))}。</p>
          </article>
        </div>

        <div class="about-list">
          <div class="about-list-row">
            <span>共享地址</span>
            <strong>http://127.0.0.1:4318</strong>
          </div>
          <div class="about-list-row">
            <span>页面注册方式</span>
            <strong><code>register-page</code> 或 <code>POST /api/register</code></strong>
          </div>
          <div class="about-list-row">
            <span>人类入口</span>
            <strong>首页只负责选择 userSpace，其余说明收敛在本页</strong>
          </div>
        </div>
      </section>
    </main>
  `;
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
  state.expandedUsers.add(user.id);

  app.innerHTML = `
    <main class="viewer-shell-page">
      <div class="workspace-layout">
        <aside class="finder-sidebar fade-in">
          <div class="sidebar-caption">User Spaces</div>
          <div class="tree-root">
            ${buildSidebarTree(registry, user.id, currentPage.id)}
          </div>
        </aside>

        <section class="viewer-region fade-in">
          <header class="viewer-topbar">
            <div class="viewer-actions">
              <a class="chrome-button" href="/" data-link>返回导航首页</a>
              <button type="button" class="chrome-button" data-action="refresh-current">刷新当前视图</button>
            </div>
            <a class="subtle-link" href="/about" data-link>关于</a>
          </header>

          <div class="viewer-frame">
            <iframe
              title="${escapeHtml(currentPage.title)}"
              src="${escapeHtml(withCacheBust(currentPage.liveUrl, state.iframeRefreshNonce))}"
              loading="lazy"
              referrerpolicy="no-referrer"
            ></iframe>
          </div>
        </section>
      </div>
    </main>
  `;
}

function renderNotFound() {
  app.innerHTML = `
    <main class="about-shell">
      ${renderCornerLink("返回首页", "/")}
      <section class="empty-card fade-in">
        <h2>没有找到这个页面</h2>
        <p>当前路径没有对应的 userSpace 或页面。返回导航首页重新选择。</p>
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

async function syncRegistry({ forceRender = false } = {}) {
  try {
    const nextRegistry = await loadRegistry();
    const previousRegistry = state.registry;
    const changed = !previousRegistry || previousRegistry.updatedAt !== nextRegistry.updatedAt;

    if (previousRegistry && shouldRefreshIframe(previousRegistry, nextRegistry)) {
      state.iframeRefreshNonce += 1;
    }

    state.registry = nextRegistry;

    if (forceRender || changed) {
      renderCurrentRoute();
    }
  } catch (error) {
    app.innerHTML = `
      <main class="about-shell">
        ${renderCornerLink("返回首页", "/")}
        <section class="empty-card fade-in">
          <h2>加载失败</h2>
          <p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p>
          <button type="button" class="chrome-button" data-action="refresh-current">重试</button>
        </section>
      </main>
    `;
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
