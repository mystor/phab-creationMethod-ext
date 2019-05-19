let site = "https://phabricator.services.mozilla.com";

/// Create a node to inject creation method into.
function addDiffEntry(name) {
  // Look for the "Diff Detail" header section.
  // This totally won't work on non-english configs.
  let shell = (() => {
    for (let shell of document.querySelectorAll('.phui-header-shell')) {
      if (shell.textContent.trim() == "Diff Detail") {
        return shell;
      }
    }
    throw new Error("Cannot find phui header shell");
  })();

  // Grab the next element, which should be the actual property list to put the
  // data in. Use `querySelector` to find the `property-list-properties` list
  // we're interested in.
  let props = shell.nextSibling.querySelector('.phui-property-list-properties');

  // Create the new row and insert it.
  let key = document.createElement('dt');
  key.className = "phui-property-list-key";
  key.textContent = name;

  let value = document.createElement('dd');
  value.className = "phui-property-list-value";
  value.textContent = "pending...";

  props.appendChild(key);
  props.appendChild(value);

  // Return the created value element.
  return value;
}

// Allow this to fail.
let creationMethodEntry;
try {
  creationMethodEntry = addDiffEntry("Creation Method");
} catch(e) {
  console.error(e);
}

// Phabricator requires a CSRF token to use cookie-based authentication to
// conduit APIs. To get around this, we need to load the corresponding request
// page. It is loaded as an HTML document.
async function conduitForm(cmd) {
  // Locate the submit form.
  let page = await new Promise(resolve => {
    let xhr = new XMLHttpRequest();
    xhr.open('GET', `${site}/conduit/method/${cmd}`, true);
    xhr.responseType = "document";
    xhr.onreadystatechange = function onreadystatechange() {
      if (xhr.readyState === 4) {
        resolve(xhr.response);
      }
    };
    xhr.send();
  });

  for (let f of page.forms) {
    if (f.action.indexOf(`${site}/api/${cmd}`) === 0) {
      return f;
    }
  }

  throw new Error("Unable to get conduit form");
}

async function conduit(cmd, args) {
  let form = await conduitForm(cmd);

  // Extract the form data, and fill it in with our conduit arguments.
  let data = new FormData(form);
  data.set("output", "json");
  for (let key of Object.keys(args)) {
    data.set(`params[${key}]`, JSON.stringify(args[key]));
  }

  // Perform the fetch
  let request = await fetch(`${site}/api/${cmd}`, {
    method: 'POST',
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: (new URLSearchParams(data)).toString(),
  });
  return request.json();
}

async function fetchCreationMethod() {
  // Check if this is an interesting site.
  let revid_prefix = `${site}/D`;
  if (window.location.href.indexOf(revid_prefix) !== 0) {
    return;
  }

  // Extract revision ID.
  let revid = parseInt(window.location.href.slice(revid_prefix.length));
  console.log(revid);

  // Query for diff info.
  let diffinfo = await conduit('differential.querydiffs', {'revisionIDs': [revid]});

  // Pick which diff to show info from (largest ID #).
  let ids = Object.keys(diffinfo.result).map(key => parseInt(key));
  ids.sort((a, b) => a - b);
  ids.reverse();
  let found = diffinfo.result[ids[0]];

  // Show the actual found creation method.
  console.log(`creationMethod: ${found.creationMethod}`);
  if (creationMethodEntry) {
    creationMethodEntry.textContent = found.creationMethod;
  }

  let phlayVersion;
  if (found.properties && found.properties["phlay:version"]) {
    phlayVersion = found.properties["phlay:version"];

    console.log(`phlayVersion: ${phlayVersion}`);
    if (creationMethodEntry) {
      creationMethodEntry.textContent += ` (v${phlayVersion})`;
    }
  }
}

(async function() {
  try {
    fetchCreationMethod();
  } catch(e) {
    console.error(e);
  }
})();
