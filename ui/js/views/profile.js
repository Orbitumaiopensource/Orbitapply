async function renderProfile() {
  const main = el('main-content');
  main.innerHTML = `
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <h1 class="page-title">Profile Setup</h1>
          <p class="page-sub">All agents read this data — complete it before running</p>
        </div>
        <button class="btn btn-primary" onclick="saveProfile()">Save Profile</button>
      </div>
    </div>
    <div id="profile-alert"></div>

    <div class="card" style="margin-bottom:var(--gap)">
      <div class="section-label">Identity</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Full Name</label><input id="p-name" class="form-input" placeholder="Jane Doe" /></div>
        <div class="form-group"><label class="form-label">Professional Title</label><input id="p-title" class="form-input" placeholder="AI Solutions Specialist" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Email</label><input id="p-email" class="form-input" type="email" placeholder="you@email.com" /></div>
        <div class="form-group"><label class="form-label">Phone Number</label><input id="p-phone" class="form-input" type="tel" placeholder="+1-214-555-0100" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">LinkedIn URL</label><input id="p-linkedin" class="form-input" placeholder="https://linkedin.com/in/..." /></div>
        <div class="form-group"><label class="form-label">Personal Website</label><input id="p-website" class="form-input" placeholder="https://yoursite.com" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">City</label><input id="p-city" class="form-input" placeholder="San Francisco" /></div>
        <div class="form-group"><label class="form-label">State</label><input id="p-state" class="form-input" placeholder="TX" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Location (full, for ATS forms)</label><input id="p-location" class="form-input" placeholder="San Francisco, CA" /></div>
        <div class="form-group"><label class="form-label">Work Authorization</label>
          <select id="p-auth" class="form-input">
            <option>US Citizen</option><option>Green Card</option><option>H1B</option><option>OPT</option><option>Other</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--gap)">
      <div class="section-label">Target Roles & Preferences</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Target Roles (comma-separated) ${tip('SCOUT searches each role as a separate query. Use 2–6 specific titles you would actually accept — broader lists return noisier results.')}</label><input id="p-roles" class="form-input" placeholder="AI Transformation Consultant, Director of AI, Head of AI" /></div>
        <div class="form-group"><label class="form-label">Target Locations (comma-separated) ${tip('Cities, states, or "Remote". SCOUT filters jobs that are outside these locations unless Remote is set.')}</label><input id="p-locations" class="form-input" placeholder="Remote, New York NY, Austin TX" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Target Industries (comma-separated) ${tip('TAILOR uses the first matching industry to frame your resume summary and core competencies (terminology, examples, keywords).')}</label><input id="p-industries" class="form-input" placeholder="SaaS, Enterprise Software, Fintech" /></div>
        <div class="form-group"><label class="form-label">Remote Preference ${tip('Affects SCOUT scoring: jobs matching your preference get a bonus, opposites get a penalty. "Open to All" treats them equally.')}</label>
          <select id="p-remote" class="form-input">
            <option value="remote">Remote Only</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
            <option value="open">Open to All</option>
          </select>
        </div>
      </div>
      <div class="form-row-3">
        <div class="form-group"><label class="form-label">Min Salary (USD) ${tip('Jobs posting compensation below this lose fit points. Jobs with no salary listed are NOT filtered out.')}</label><input id="p-salmin" class="form-input" type="number" placeholder="120000" /></div>
        <div class="form-group"><label class="form-label">Max Salary (USD) ${tip('Used as a sanity ceiling. Mostly informational — does not strongly affect scoring.')}</label><input id="p-salmax" class="form-input" type="number" placeholder="180000" /></div>
        <div class="form-group"><label class="form-label">Notice Period ${tip('Shown to recruiters in the cover letter if relevant. Does not affect scoring.')}</label>
          <select id="p-notice" class="form-input">
            <option>Immediate</option><option>2 weeks</option><option>30 days</option><option>60 days</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--gap)">
      <div class="section-label">Job Search Quality Controls</div>
      <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:var(--gap)">
        These settings control how SCOUT scores and filters job results. Tune them to match your career level and goals.
      </p>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Seniority Keywords (comma-separated) ${tip('Jobs whose title contains ANY of these words get a full title-match score. Add the seniority levels you actually want to target.')}</label>
          <input id="p-seniority" class="form-input" placeholder="director, head, vp, consultant, specialist, architect, lead, manager" />
          <span style="font-size:0.78rem;color:var(--text-muted)">Jobs matching ANY of these words get full title score. Add your target level words here.</span>
        </div>
        <div class="form-group">
          <label class="form-label">Exclude These Title Keywords (comma-separated) ${tip('Hard filter — jobs whose title contains ANY of these words are removed from results entirely. Useful for screening out levels below your target.')}</label>
          <input id="p-exclude-titles" class="form-input" placeholder="junior, entry level, intern, associate, coordinator" />
          <span style="font-size:0.78rem;color:var(--text-muted)">Jobs containing ANY of these words are filtered out automatically.</span>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Minimum Fit Score to Show (0-100) ${tip('Display-only filter. SCOUT is free (no AI calls), so lowering this only changes what appears in the UI. Default: 30. Try 20 for more results.')}</label>
          <input id="p-minscore" class="form-input" type="number" min="0" max="100" placeholder="50" />
          <span style="font-size:0.78rem;color:var(--text-muted)">Jobs scoring below this are hidden. Lower = more results, Higher = better quality.</span>
        </div>
        <div class="form-group">
          <label class="form-label">Minimum Score to Auto-Qualify for TAILOR (0-100) ${tip('Jobs above this threshold automatically run through RECON (Haiku) + TAILOR (Sonnet), generating a tailored resume and cover letter. Each costs API tokens — lowering this burns budget faster. Default: 70.')}</label>
          <input id="p-qualifyscore" class="form-input" type="number" min="0" max="100" placeholder="70" />
          <span style="font-size:0.78rem;color:var(--text-muted)">Jobs scoring above this are passed to RECON and TAILOR automatically.</span>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--gap)">
      <div class="section-label">Resume & Skills</div>
      <div class="form-group"><label class="form-label">Skills (comma-separated)</label><input id="p-skills" class="form-input" placeholder="Claude API, n8n, Product Strategy, AI Tools, No-code" /></div>
      <div class="form-group"><label class="form-label">Years of Experience</label><input id="p-exp" class="form-input" type="number" placeholder="8" /></div>
      <div class="form-group"><label class="form-label">Resume Summary / Base Resume (Markdown paste)</label><textarea id="p-resume" class="form-input form-textarea" rows="6" placeholder="Paste your base resume here or a summary..."></textarea></div>
      <div class="form-group">
        <label class="form-label">Production Systems / Projects (one per line) ${tip('Concrete systems you have built that TAILOR can name in the resume. Format: "Project Name: short description with the stack used and the outcome." Each line becomes one bullet in the PRODUCTION SYSTEMS BUILT section.')}</label>
        <textarea id="p-prodsystems" class="form-input form-textarea" rows="5" placeholder="Voice AI: inbound/outbound calling system for an insurance client using Retell AI, Telnyx, and Claude API; enabled 24/7 automated client engagement\nRAG Pipeline: hybrid retrieval for a recruitment company using Supabase pgvector + Postgres; citation-grounded responses\nMulti-Agent Content System: automated blog pipeline using N8N and Claude API; cut content production time by 80%+"></textarea>
        <span style="font-size:0.78rem;color:var(--text-muted)">Write only what you have actually shipped — TAILOR will never fabricate metrics.</span>
      </div>
      <div class="form-group">
        <label class="form-label">Technology Stack (categorized, one category per line) ${tip('TAILOR uses this to populate the TECHNOLOGY STACK section. Format: "Category: items, items, items". Used verbatim — be specific.')}</label>
        <textarea id="p-techstack" class="form-input form-textarea" rows="6" placeholder="AI & LLM Platforms: Claude API (Anthropic), OpenAI API, Retell AI (Voice AI)\nAutomation & Workflows: N8N, Docker, self-hosted VPS with reverse proxy (Nginx)\nData & Vector Search: Supabase (pgvector + Postgres), hybrid RAG retrieval\nVoice & Telephony: Retell AI, Telnyx\nCloud Ecosystem: M365, SharePoint, Microsoft Copilot"></textarea>
      </div>
    </div>

    <div class="card">
      <div class="section-label">ORBIT Positioning</div>
      <div class="form-group"><label class="form-label">ORBIT Positioning Statement</label><textarea id="p-orbit" class="form-input form-textarea" rows="3" placeholder="e.g. AI Implementation Specialist who reduces time-to-deployment by 60% for SMB founders using no-code Claude integrations"></textarea></div>
      <div class="form-group"><label class="form-label">Cover Letter Tone</label>
        <select id="p-tone" class="form-input">
          <option value="orbit-framework">ORBIT Framework (recommended)</option>
          <option value="formal">Formal</option>
          <option value="conversational">Conversational</option>
        </select>
      </div>
    </div>
  `;

  await loadProfileData();
}

async function loadProfileData() {
  try {
    const profile = await API.get('/api/v1/profile');
    if (el('p-name')) el('p-name').value = profile.name || '';
    if (el('p-title')) el('p-title').value = profile.title || '';
    if (el('p-email')) el('p-email').value = profile.email || '';
    if (el('p-phone')) el('p-phone').value = profile.phone || '';
    if (el('p-linkedin')) el('p-linkedin').value = profile.linkedinUrl || '';
    if (el('p-website')) el('p-website').value = profile.website || '';
    if (el('p-city')) el('p-city').value = profile.city || '';
    if (el('p-state')) el('p-state').value = profile.state || '';
    if (el('p-location')) el('p-location').value = profile.location || '';
    if (el('p-auth')) el('p-auth').value = profile.workAuthorization || 'US Citizen';
    if (el('p-roles')) el('p-roles').value = (profile.targetRoles || []).join(', ');
    if (el('p-locations')) el('p-locations').value = (profile.targetLocations || []).join(', ');
    if (el('p-industries')) el('p-industries').value = (profile.targetIndustries || []).join(', ');
    if (el('p-remote')) el('p-remote').value = profile.remotePreference || 'open';
    if (el('p-salmin')) el('p-salmin').value = profile.salaryMin || '';
    if (el('p-salmax')) el('p-salmax').value = profile.salaryMax || '';
    if (el('p-notice')) el('p-notice').value = profile.noticePeriod || '2 weeks';
    if (el('p-skills')) el('p-skills').value = (profile.skills || []).join(', ');
    if (el('p-exp')) el('p-exp').value = profile.yearsExperience || '';
    if (el('p-resume')) el('p-resume').value = profile.resume?.summary || '';
    if (el('p-prodsystems')) el('p-prodsystems').value = profile.productionSystems || '';
    if (el('p-techstack')) el('p-techstack').value = profile.techStackText || '';
    if (el('p-orbit')) el('p-orbit').value = profile.orbitPositioningStatement || '';
    if (el('p-tone')) el('p-tone').value = profile.coverLetterTone || 'orbit-framework';
    if (el('p-seniority')) el('p-seniority').value = (profile.seniorityKeywords || ['director','head','vp','vice president','chief','principal','lead','manager','consultant','specialist','architect','strategist','advisor','executive']).join(', ');
    if (el('p-exclude-titles')) el('p-exclude-titles').value = (profile.excludeTitles || ['junior','entry level','intern','associate','coordinator']).join(', ');
    if (el('p-minscore')) el('p-minscore').value = profile.minFitScore ?? 50;
    if (el('p-qualifyscore')) el('p-qualifyscore').value = profile.minQualifyScore ?? 70;
  } catch (err) {
    showAlert('profile-alert', err.message, 'error');
  }
}

async function saveProfile() {
  clearAlert('profile-alert');
  const csvToArr = s => s.split(',').map(x => x.trim()).filter(Boolean);
  const profile = {
    name: el('p-name')?.value.trim(),
    title: el('p-title')?.value.trim(),
    email: el('p-email')?.value.trim(),
    phone: el('p-phone')?.value.trim(),
    linkedinUrl: el('p-linkedin')?.value.trim(),
    website: el('p-website')?.value.trim(),
    city: el('p-city')?.value.trim(),
    state: el('p-state')?.value.trim(),
    location: el('p-location')?.value.trim(),
    workAuthorization: el('p-auth')?.value,
    targetRoles: csvToArr(el('p-roles')?.value || ''),
    targetLocations: csvToArr(el('p-locations')?.value || ''),
    targetIndustries: csvToArr(el('p-industries')?.value || ''),
    remotePreference: el('p-remote')?.value,
    salaryMin: parseInt(el('p-salmin')?.value || '0', 10),
    salaryMax: parseInt(el('p-salmax')?.value || '0', 10),
    noticePeriod: el('p-notice')?.value,
    skills: csvToArr(el('p-skills')?.value || ''),
    yearsExperience: parseInt(el('p-exp')?.value || '0', 10),
    resume: { summary: el('p-resume')?.value.trim(), path: 'memory/resume.md' },
    productionSystems: el('p-prodsystems')?.value.trim() || '',
    techStackText: el('p-techstack')?.value.trim() || '',
    orbitPositioningStatement: el('p-orbit')?.value.trim(),
    coverLetterTone: el('p-tone')?.value,
    seniorityKeywords: csvToArr(el('p-seniority')?.value || ''),
    excludeTitles: csvToArr(el('p-exclude-titles')?.value || ''),
    minFitScore: parseInt(el('p-minscore')?.value || '50', 10),
    minQualifyScore: parseInt(el('p-qualifyscore')?.value || '70', 10),
  };

  try {
    await API.put('/api/v1/profile', profile);
    showAlert('profile-alert', 'Profile saved successfully.', 'success');
  } catch (err) {
    showAlert('profile-alert', err.message, 'error');
  }
}
