import React from "react";
import { seededManagers } from "../lib/fantasy";

function Login({ loginState, onLoginChange, onSubmit, onQuickLogin }) {
  return (
    <main className="shell login-shell">
      <section className="panel login-panel">
        <p className="eyebrow">World Cup Fantasy Draft</p>
        <h1>Manager Login</h1>
        <form className="login-form" onSubmit={onSubmit}>
          <label>
            Login name
            <input
              value={loginState.loginName}
              onChange={(event) => onLoginChange({ loginName: event.target.value })}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={loginState.password}
              onChange={(event) => onLoginChange({ password: event.target.value })}
            />
          </label>
          {loginState.error && <p className="form-error">{loginState.error}</p>}
          <button type="submit">Log In</button>
        </form>
        {onQuickLogin && (
          <div className="quick-logins">
            {seededManagers.map((manager) => (
              <button key={manager.loginName} onClick={() => onQuickLogin(manager.loginName)} type="button">
                {manager.logo && <img className="team-logo" src={manager.logo} alt="" />} {manager.label}
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default Login;
