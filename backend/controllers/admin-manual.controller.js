const manual = require("../content/admin-manual.content");

function content(req, res) {
  res.set("Cache-Control", "private, no-store, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return res.json({ manual });
}

module.exports = {
  content
};
