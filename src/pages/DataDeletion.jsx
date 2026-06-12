export default function DataDeletion() {
  return (
    <div className="container page-content" style={{ maxWidth: 720, paddingTop: '2rem', paddingBottom: '3rem' }}>
      <h1>Data Deletion Instructions</h1>
      <p>
        Sporting Expressionz does not store your personal data; it is used only for login.
        According to the Facebook Platform rules, we have to provide a User Data Deletion Callback URL
        or Data Deletion Instructions URL. If you want to delete your activities for Sporting Expressionz,
        follow these instructions:
      </p>
      <ol>
        <li>Go to your Facebook Account's <strong>Settings &amp; Privacy</strong> and click <strong>Settings</strong>.</li>
        <li>Go to <strong>Apps and Websites</strong> — you will see all of your connected app activities.</li>
        <li>Select the option box for <strong>Sporting Expressionz</strong>.</li>
        <li>Click the <strong>Remove</strong> button.</li>
      </ol>
    </div>
  );
}
