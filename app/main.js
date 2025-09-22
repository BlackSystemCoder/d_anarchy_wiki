function createSlugger() {
  const seen = new Map();

  function encodeChar(ch) {
    // Разрешаем буквы и цифры Юникода + подчеркивания и дефисы
    if (/[\p{L}\p{N}_-]/u.test(ch)) return ch;
    // Пробелы заменим заранее, так что сюда не попадут
    // Всё остальное кодируем как %XX (UTF-8)
    const utf8 = new TextEncoder().encode(ch);
    return Array.from(utf8)
      .map(b => "%" + b.toString(16).toUpperCase().padStart(2, "0"))
      .join("");
  }

  function slug(title) {
    // Пробелы → подчёркивания
    let text = title.replace(/\s+/g, "_");
    // Кодируем каждый символ
    let slug = "";
    for (const ch of text) {
      slug += encodeChar(ch);
    }
    // Уникализируем
    let id = slug;
    if (seen.has(slug)) {
      const count = seen.get(slug) + 1;
      seen.set(slug, count);
      id = slug + "_" + count;
    } else {
      seen.set(slug, 1);
    }
    return id;
  }

  function reset() {
    seen.clear();
  }

  return { slug, reset };
}

let currentArticlePath;

async function loadArticle() {
	let rawHash = location.hash.substring(1),
		[hashPath, queryPart] = rawHash.split('?', 2);

	hashPath ||= 'd_of_sch.md';

	let mdIndex = hashPath.lastIndexOf('.md');

	if(mdIndex === -1) {
	    return;
	}

	let articlePath = hashPath.substring(0, mdIndex+3);

	if(articlePath === currentArticlePath) {
		return;
	}

	currentArticlePath = articlePath;

	let params = new URLSearchParams(queryPart || '');

	console.log("Hash path:", hashPath);
	console.log("Article path:", articlePath);
	console.log("Params:", Object.fromEntries(params.entries()));

	let response = await fetch('/d_anarchy_wiki/app/article/'+articlePath);
	let text = await response.text();
	let firstHeading = text.match(/^# (.+)/);

	if(firstHeading) {
		document.title = firstHeading[1];
	}

	let smartQuotes = {
		name: 'smartQuotes',
		level: 'inline',
		start(src) {
			return src.match(/["]| - /)?.index;
		},
		tokenizer(src) {
			if(src[0] === '"') {
				if(quoteStack.length === 0 || quoteStack[quoteStack.length-1] === 'open') {
					quoteStack.push('close');

					return { type: 'smartQuotes', raw: '"', text: '«' };
				} else {
					quoteStack.pop();

					return { type: 'smartQuotes', raw: '"', text: '»' };
				}
			}
			if(src.startsWith(' - ')) {
				return { type: 'smartQuotes', raw: ' - ', text: ' — ' };
			}
		},
		renderer(token) {
			return token.text;
		}
	};

	let slugger = createSlugger(),
		renderer = {
		image({ href, title, text }) {
			let caption = title || text || '';

			return `
				<a href="${href}">
					<img src="${href}" alt="${escapeHtml(text)}" ${text ? `title="${escapeHtml(text)}"` : ''}>
				</a>
			`;
		},
		paragraph({ tokens }) {
			if(tokens.length === 1 && tokens[0].type === 'image') {
				let img = tokens[0];
				let caption = img.title;

				return `
					<figure>
						${this.parser.parseInline(tokens)}
						${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
					</figure>
				`;
			}

			return `<p>${this.parser.parseInline(tokens)}</p>`;
		},
		tablecell({ text, header, align, tokens }, { cells }) {
			let tag = header ? 'th' : 'td';
			let style = align ? ` style="text-align:${align}"` : '';

			if(cells.length === 1) {
				let colspan = cells[0].length;

				return `<${tag}${style} colspan="${colspan}">${text}</${tag}>`;
			}

			return `<${tag}${style}>${text}</${tag}>`;
		},
		heading({ text, depth, raw }) {
			let slugged = articlePath+'/'+slugger.slug(text);

			if(depth === 1) {
				return `<h1 id="${slugged}">${text}</h1>\n<small class="after-h1">Материал из Шизовикии</small>\n`;
			}

			return `<h${depth} id="${slugged}"><a href="#${slugged}">${text}</a></h${depth}>\n`;
		}
	};

	function escapeHtml(str = '') {
		return String(str)
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	marked.use({
		extensions: [smartQuotes],
		hooks: {
			preprocess(md) {
				quoteStack = [];

				return md;
			}
		}
	});
	marked.use(window['extended-tables']());
	marked.use({ renderer });
	marked.use({
		async: true
	});

	document.getElementById('content').innerHTML = await marked.parse(text);
	document.getElementById(rawHash).scrollIntoView();
}

onload = () => {
	loadArticle();

	onhashchange = () => loadArticle();
}