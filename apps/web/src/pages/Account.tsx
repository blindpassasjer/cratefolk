import { useState, type FormEvent, type ReactNode } from "react";
import { api, CURRENCIES } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../notify";
import { SHOPS, parseShops } from "../Market";
import AdminUsers from "./AdminUsers";

const input =
  "w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm outline-none transition-colors focus:border-wax disabled:opacity-60";
const button =
  "rounded-md bg-wax px-4 py-2 text-sm font-medium text-on-wax transition-colors hover:bg-wax-hover disabled:opacity-60";

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-6 break-inside-avoid space-y-4 rounded-xl border border-ink-800 bg-ink-900/60 p-5">
      <div>
        <h2 className="font-medium">{title}</h2>
        {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm text-ink-300">
      {label}
      {children}
    </label>
  );
}

export default function Account() {
  const { user, refresh, setCurrency } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "admin";

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [emailPassword, setEmailPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [discogsToken, setDiscogsToken] = useState("");
  const [connecting, setConnecting] = useState(false);

  async function connectDiscogs(e: FormEvent) {
    e.preventDefault();
    setConnecting(true);
    try {
      const { discogsUsername } = await api<{ discogsUsername: string }>(
        "/auth/discogs",
        { method: "PUT", json: { token: discogsToken } },
      );
      await refresh();
      setDiscogsToken("");
      toast.success(`Connected to Discogs as ${discogsUsername}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not connect to Discogs",
      );
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectDiscogs() {
    try {
      await api("/auth/discogs", { method: "DELETE" });
      await refresh();
      toast.success("Disconnected from Discogs");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not disconnect from Discogs",
      );
    }
  }

  const emailChanged = !!user && email.trim().toLowerCase() !== user.email;

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api("/auth/me", {
        method: "PATCH",
        json: {
          name,
          ...(emailChanged
            ? { email: email.trim(), currentPassword: emailPassword }
            : {}),
        },
      });
      await refresh();
      setEmailPassword("");
      toast.success(
        emailChanged
          ? "Profile saved. Use your new email next time you sign in."
          : "Profile saved",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save your profile",
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveSharing(patch: {
    shareCollection?: boolean;
    shareWishlist?: boolean;
    shareActivity?: boolean;
  }) {
    try {
      await api("/auth/me", { method: "PATCH", json: patch });
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not save your sharing settings",
      );
    }
  }

  async function saveShops(id: string, on: boolean) {
    const current = parseShops(user?.shops);
    const shops = on ? [...current, id] : current.filter((s) => s !== id);
    try {
      await api("/auth/me", {
        method: "PATCH",
        json: {
          shops: SHOPS.filter((s) => shops.includes(s.id)).map((s) => s.id),
        },
      });
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save your shops",
      );
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) return toast.error("The new passwords don't match");
    setSavingPassword(true);
    try {
      await api("/auth/password", {
        method: "POST",
        json: { currentPassword: current, newPassword: next },
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success(
        "Password changed. Your other devices have been signed out.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not change your password",
      );
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="space-y-10">
      <div className="space-y-8">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>

        <div className="columns-1 gap-6 md:columns-2">

            <Card
              title="Profile"
              hint={
                isAdmin
                  ? "The admin email is set with ADMIN_EMAIL in your environment, so only the name can be changed here."
                  : undefined
              }
            >
              <form onSubmit={saveProfile} className="space-y-4">
                <Field label="Name">
                  <input
                    className={input}
                    required
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field label="Email address">
                  <input
                    className={input}
                    type="email"
                    required
                    disabled={isAdmin}
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                {emailChanged && (
                  <Field label="Current password (needed to change your email)">
                    <input
                      className={input}
                      type="password"
                      required
                      autoComplete="current-password"
                      value={emailPassword}
                      onChange={(e) => setEmailPassword(e.target.value)}
                    />
                  </Field>
                )}
                <div className="flex items-center gap-4">
                  <button className={button} disabled={savingProfile}>
                    {savingProfile ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            </Card>

            <Card
              title="Password"
              hint={
                isAdmin
                  ? "The admin password is set with ADMIN_PASSWORD in your environment. Change it there and restart."
                  : "Changing it signs you out of your other devices."
              }
            >
              {!isAdmin && (
                <form onSubmit={savePassword} className="space-y-4">
                  <Field label="Current password">
                    <input
                      className={input}
                      type="password"
                      required
                      autoComplete="current-password"
                      value={current}
                      onChange={(e) => setCurrent(e.target.value)}
                    />
                  </Field>
                  <Field label="New password (8+ characters)">
                    <input
                      className={input}
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={next}
                      onChange={(e) => setNext(e.target.value)}
                    />
                  </Field>
                  <Field label="Repeat new password">
                    <input
                      className={input}
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </Field>
                  <div className="flex items-center gap-4">
                    <button className={button} disabled={savingPassword}>
                      {savingPassword ? "Changing…" : "Change password"}
                    </button>
                  </div>
                </form>
              )}
            </Card>

            <Card
              title="Discogs"
              hint="Connect your own Discogs account so Cratelog can work with your Discogs collection and wantlist. Cratelog never asks for your Discogs password."
            >
              {user?.discogsUsername ? (
                <div className="flex items-center justify-between gap-4 text-sm">
                  <p className="text-ink-300">
                    Connected as{" "}
                    <a
                      href={`https://www.discogs.com/user/${encodeURIComponent(user.discogsUsername)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-ink-100 hover:text-wax"
                    >
                      {user.discogsUsername}
                    </a>
                  </p>
                  <button
                    type="button"
                    onClick={() => void disconnectDiscogs()}
                    className="rounded-md border border-ink-700 px-3 py-1.5 text-sm hover:border-ink-500"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <form onSubmit={connectDiscogs} className="space-y-4">
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-300">
                    <li>
                      Open{" "}
                      <a
                        href="https://www.discogs.com/settings/developers"
                        target="_blank"
                        rel="noreferrer"
                        className="text-ink-100 underline hover:text-wax"
                      >
                        Discogs → Settings → Developers
                      </a>
                    </li>
                    <li>Click "Generate new token" and copy it</li>
                    <li>Paste it below</li>
                  </ol>
                  <Field label="Personal access token">
                    <input
                      className={input}
                      type="password"
                      required
                      autoComplete="off"
                      value={discogsToken}
                      onChange={(e) => setDiscogsToken(e.target.value)}
                    />
                  </Field>
                  <p className="text-xs text-ink-500">
                    The token is checked with Discogs, then stored encrypted on
                    this server. You can disconnect here or revoke it on
                    Discogs at any time.
                  </p>
                  <button className={button} disabled={connecting}>
                    {connecting ? "Checking…" : "Connect"}
                  </button>
                </form>
              )}
            </Card>

            <Card
              title="Currency"
              hint="Marketplace prices on your wishlist are shown in this currency. NOK is used for your asking prices, but Discogs does not offer it, so marketplace prices show in EUR."
            >
              <Field label="Currency">
                <select
                  className={input}
                  value={user?.currency ?? "USD"}
                  onChange={(e) => void setCurrency(e.target.value)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </Card>

            <Card
              title="Shop links"
              hint="Shops to show quick search links for on your wishlist and record pages. These open the shop's own search, so no prices are shown."
            >
              {(["Global", "Nordic", "Europe", "UK & US"] as const).map(
                (region) => (
                  <fieldset key={region} className="space-y-2">
                    <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-500">
                      {region}
                    </legend>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {SHOPS.filter((s) => s.region === region).map((shop) => (
                        <label
                          key={shop.id}
                          className="flex items-center gap-2 text-sm text-ink-300"
                        >
                          <input
                            type="checkbox"
                            className="accent-wax"
                            checked={parseShops(user?.shops).includes(shop.id)}
                            onChange={(e) =>
                              void saveShops(shop.id, e.target.checked)
                            }
                          />
                          {shop.name}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ),
              )}
            </Card>

          <Card
            title="Sharing"
            hint="Friends on this Cratelog can browse what you allow here. They only see which records you have, never your grades, notes or prices. Activity only shows for the parts of your Cratelog you share."
          >
            {(
              [
                ["shareCollection", "Let friends browse my collection"],
                ["shareWishlist", "Let friends see my wishlist"],
                [
                  "shareActivity",
                  "Show what I add, wishlist and sell in friends' activity feeds",
                ],
              ] as const
            ).map(([field, label]) => (
              <label
                key={field}
                className="flex items-center gap-2 text-sm text-ink-300"
              >
                <input
                  type="checkbox"
                  className="accent-wax"
                  checked={!!user?.[field]}
                  onChange={(e) =>
                    void saveSharing({ [field]: e.target.checked })
                  }
                />
                {label}
              </label>
            ))}
          </Card>
          {isAdmin && (
            <AdminUsers />
          )}
        </div>
      </div>
    </div>
  );
}
