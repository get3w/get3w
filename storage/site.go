package storage

import (
	"path"
	"path/filepath"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/parser"
	"github.com/get3w/get3w/pkg/stringutils"
)

// system file name
const (
	KeyReadme  = "README.md"
	KeyConfig  = "CONFIG.yml"
	KeySummary = "SUMMARY.md"
)

// Site contains attributes and operations of the app
type Site struct {
	Name              string
	Path              string
	Read              func(key string) (string, error)
	Checksum          func(key string) (string, error)
	Write             func(key string, bs []byte) error
	WriteDestination  func(key string, bs []byte) error
	Download          func(key string, downloadURL string) error
	Rename            func(owner, newName string, deleteAll bool) error
	Delete            func(key string) error
	DeleteDestination func(key string) error
	DeleteAll         func(prefix string) error
	GetFiles          func(prefix string) ([]*get3w.File, error)
	GetAllFiles       func() ([]*get3w.File, error)
	IsExist           func(key string) bool

	config        *get3w.Config
	pageSummaries []*get3w.PageSummary
	pages         []*get3w.Page
	sections      map[string]*get3w.Section
}

// GetKey get file key by relatedURL
func (site *Site) GetKey(url ...string) string {
	return strings.Trim(path.Join(url...), "/")
}

// GetConfigKey get CONFIG.yml file key
func (site *Site) GetConfigKey() string {
	return site.GetKey(KeyConfig)
}

// GetSummaryKey get SUMMARY.md file key
func (site *Site) GetSummaryKey() string {
	return site.GetKey(KeySummary)
}

// GetSectionKey get html file key by sectionName
func (site *Site) GetSectionKey(relatedURL string) string {
	return site.GetKey("_sections", relatedURL)
}

// GetConfig get config file content
func (site *Site) GetConfig() *get3w.Config {
	if site.config == nil {
		config := &get3w.Config{}
		configData, err := site.Read(site.GetConfigKey())
		if err == nil {
			parser.LoadConfig(config, configData)
		}

		site.config = config
	}

	return site.config
}

// GetPageSummaries get SUMMARY.md file content
func (site *Site) GetPageSummaries() []*get3w.PageSummary {
	if site.pageSummaries == nil {
		summaries := []*get3w.PageSummary{}

		data, err := site.Read(site.GetSummaryKey())
		if err == nil {
			summaries = parser.UnmarshalSummary(data)
		}

		site.pageSummaries = summaries
	}

	return site.pageSummaries
}

// GetPages parse SUMMARY.md file and returns pages
func (site *Site) GetPages() []*get3w.Page {
	if site.pages == nil {
		pages := []*get3w.Page{}

		summaries := site.GetPageSummaries()
		for _, summary := range summaries {
			page := site.getPageBySummary(summary)
			pages = append(pages, page)
		}

		site.pages = pages
	}

	return site.pages
}

func (site *Site) getPageBySummary(summary *get3w.PageSummary) *get3w.Page {
	page := site.GetPage(summary)

	if len(summary.Children) > 0 {
		for _, child := range summary.Children {
			childPage := site.getPageBySummary(child)
			page.Children = append(page.Children, childPage)
		}
	}

	return page
}

// GetSections get page models by pageName
func (site *Site) GetSections() map[string]*get3w.Section {
	if site.sections == nil {
		sections := make(map[string]*get3w.Section)
		files, _ := site.GetFiles(site.GetSectionKey(""))
		for _, file := range files {
			ext := filepath.Ext(file.Path)
			if ext != parser.ExtHTML && ext != parser.ExtCSS && ext != parser.ExtJS {
				continue
			}
			sectionName := strings.Replace(file.Name, ext, "", 1)
			section := sections[sectionName]
			if section == nil {
				section = &get3w.Section{
					ID:   stringutils.Base64ForURLEncode(sectionName),
					Name: sectionName,
				}
			}
			if ext == parser.ExtHTML {
				section.HTML = site.ReadSectionContent(file)
			} else if ext == parser.ExtCSS {
				section.CSS = site.ReadSectionContent(file)
			} else if ext == parser.ExtJS {
				section.JS = site.ReadSectionContent(file)
			}

			sections[sectionName] = section
		}

		site.sections = sections
	}

	return site.sections
}

// ReadSectionContent get section file content
func (site *Site) ReadSectionContent(file *get3w.File) string {
	keyName := site.GetSectionKey(file.Name)
	str, err := site.Read(keyName)
	if err != nil {
		return ""
	}
	return str
}

// WriteConfig write content to config file
func (site *Site) WriteConfig(config *get3w.Config) {
	if config != nil {
		configKey := site.GetConfigKey()
		yaml, err := config.String()
		if err != nil {
			site.Write(configKey, []byte(yaml))
		}
	}
}

// WritePage write content to page file
func (site *Site) WritePage(page *get3w.Page) {
	if page != nil {
		pageKey := site.GetKey(page.TemplateURL)
		yaml, err := page.String()
		if err != nil {
			site.Write(pageKey, []byte(yaml))
		}
	}
}

// SaveSection write content to section
func (site *Site) SaveSection(section *get3w.Section) {
	site.Write(site.GetSectionKey(section.Name+parser.ExtHTML), []byte(section.HTML))
	site.Write(site.GetSectionKey(section.Name+parser.ExtCSS), []byte(section.CSS))
	site.Write(site.GetSectionKey(section.Name+parser.ExtJS), []byte(section.JS))
	// 	previewHTML := `<!DOCTYPE html>
	// <html lang="en">
	// <head>
	//     <meta charset="utf-8">
	//     <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
	//     <meta name="viewport" content="width=device-width, initial-scale=1">
	//     <title>` + section.Name + `</title>
	//     <link href="http://cdn.get3w.com/assets/css/font-awesome/4.4.0/css/font-awesome.min.css" rel="stylesheet">
	//     <link href="http://cdn.get3w.com/assets/css/animate.css/3.4.0/animate.min.css" rel="stylesheet">
	//     <link href="http://cdn.get3w.com/assets/css/csstoolkits/0.0.1/ct.min.css" rel="stylesheet">
	//     <link href="` + section.Name + `.css" rel="stylesheet">
	// </head>
	// <body>
	// <section class="this">
	//     ` + section.HTML + `
	// </section>
	// <script src="` + section.Name + `.js"></script>
	// </body>
	// </html>`
	// 	site.WritePreview(site.GetSectionKey(section.Name+parser.ExtHTML), []byte(previewHTML))
}

// ChangeAppName change the name of app
func (site *Site) ChangeAppName(owner, newName string) {
	if site.Rename != nil && site.Name != newName {
		site.Rename(owner, newName, true)
	}
}

// GetPage get page models by pageName
func (site *Site) GetPage(summary *get3w.PageSummary) *get3w.Page {
	data := ""
	if parser.IsExt(summary.TemplateURL) {
		pageKey := site.GetKey(summary.TemplateURL)
		data, _ = site.Read(pageKey)
	}

	return parser.UnmarshalPage(summary, data)
}

// DeletePage delete page file
func (site *Site) DeletePage(summary *get3w.PageSummary) {
	site.Delete(site.GetKey(summary.TemplateURL))
}

// DeleteSection delete section files
func (site *Site) DeleteSection(sectionName string) {
	site.Delete(site.GetSectionKey(sectionName + parser.ExtHTML))
	site.Delete(site.GetSectionKey(sectionName + parser.ExtCSS))
	site.Delete(site.GetSectionKey(sectionName + parser.ExtJS))
}

// ReadFileContent return file content
func (site *Site) ReadFileContent(key string) string {
	key = site.GetKey(key)
	str, err := site.Read(key)
	if err != nil {
		return ""
	}
	return str
}

// WriteFileContent update file content
func (site *Site) WriteFileContent(key string, content string) {
	key = site.GetKey(key)
	site.Write(key, []byte(content))
}

// NewFolder create folder
func (site *Site) NewFolder(key string) {
	key = site.GetKey(key)
	key = strings.Trim(strings.TrimSpace(key), "/") + "/"
	site.Write(key, []byte(""))
}

// DeleteFile delete file
func (site *Site) DeleteFile(key string) {
	key = site.GetKey(key)
	site.Delete(key)
}

// DeleteFolder delete folder
func (site *Site) DeleteFolder(key string) {
	key = site.GetKey(key)
	key = strings.Trim(strings.TrimSpace(key), "/") + "/"
	site.Delete(key)
}

// Build all pages in the app.
func (site *Site) Build() {
	config := site.GetConfig()
	pages := site.GetPages()
	sections := site.GetSections()

	site.buildPages(config, pages, sections)
}

func (site *Site) buildPages(config *get3w.Config, pages []*get3w.Page, sections map[string]*get3w.Section) {
	for _, page := range pages {
		parsedContent := parser.ParsePage(config, page, sections)
		key := site.GetKey(page.PageURL)
		site.WriteDestination(key, []byte(parsedContent))

		if len(page.Children) > 0 {
			site.buildPages(config, page.Children, sections)
		}
	}
}
