package site

import (
	"bytes"
	"fmt"
	"path"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/stringutils"
)

// Site contains attributes and operations of the app
type Site struct {
	Name        string
	Read        func(key string) (string, error)
	Write       func(key, value string) error
	WriteBinary func(key string, bs []byte) error
	Download    func(key string, downloadURL string) error
	Rename      func(newName string, deleteAll bool) error
	Delete      func(key string) error
	DeleteAll   func(prefix string) error
	GetFiles    func(prefix string) ([]*get3w.File, error)
	GetAllFiles func() ([]*get3w.File, error)
	IsExist     func(key string) bool

	config *get3w.Config
}

// GetPageKey get key by pageName
func (site *Site) GetPageKey(pageName string) string {
	return path.Join("_pages", pageName) + ".yml"
}

// GetSectionHTMLKey get html file key by sectionName
func (site *Site) GetSectionHTMLKey(sectionName string) string {
	return path.Join("_sections", sectionName) + ".html"
}

// GetSectionCSSKey get css file key by sectionName
func (site *Site) GetSectionCSSKey(sectionName string) string {
	return path.Join("_sections", sectionName) + ".css"
}

// GetSectionJSKey get js file key by sectionName
func (site *Site) GetSectionJSKey(sectionName string) string {
	return path.Join("_sections", sectionName) + ".js"
}

// GetSectionPreviewHTMLKey get preview file key by sectionName
func (site *Site) GetSectionPreviewHTMLKey(sectionName string) string {
	return path.Join("_sections", sectionName) + "-preview.html"
}

// GetSectionPreviewPNGKey get preview cover file key by sectionName
func (site *Site) GetSectionPreviewPNGKey(sectionName string) string {
	return path.Join("_sections", sectionName) + ".png"
}

// GetConfigKey get preview config file key
func (site *Site) GetConfigKey() string {
	return path.Join("_config.yml")
}

// GetKey get file key by relatedURL
func (site *Site) GetKey(relatedURL string) string {
	return relatedURL
}

// GetConfig get config file content
func (site *Site) GetConfig() *get3w.Config {
	if site.config == nil {
		config := &get3w.Config{}
		configKey := site.GetConfigKey()
		configData, err := site.Read(configKey)
		if err == nil {
			config.Load(configData)
		}

		site.config = config
	}
	return site.config
}

// ReadSectionHTML get section html file content
func (site *Site) ReadSectionHTML(sectionName string) string {
	keyName := site.GetSectionHTMLKey(sectionName)
	str, err := site.Read(keyName)
	if err != nil {
		return ""
	}
	return str
}

// ReadSectionCSS get section css file content
func (site *Site) ReadSectionCSS(sectionName string) string {
	keyName := site.GetSectionCSSKey(sectionName)
	str, err := site.Read(keyName)
	if err != nil {
		return ""
	}
	return str
}

// ReadSectionJS get section js file content
func (site *Site) ReadSectionJS(sectionName string) string {
	keyName := site.GetSectionJSKey(sectionName)
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
			site.Write(configKey, yaml)
		}
	}
}

// WritePage write content to page file
func (site *Site) WritePage(page *get3w.Page) {
	if page != nil {
		pageKey := site.GetPageKey(page.Name)
		yaml, err := page.String()
		if err != nil {
			site.Write(pageKey, yaml)
		}
	}
}

// SaveSection write content to section
func (site *Site) SaveSection(section *get3w.Section) {
	site.Write(site.GetSectionHTMLKey(section.Name), section.HTML)
	site.Write(site.GetSectionCSSKey(section.Name), section.CSS)
	site.Write(site.GetSectionJSKey(section.Name), section.JS)
	previewHTML := `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>` + section.Name + `</title>
    <link href="http://cdn.get3w.com/assets/css/font-awesome/4.4.0/css/font-awesome.min.css" rel="stylesheet">
    <link href="http://cdn.get3w.com/assets/css/animate.css/3.4.0/animate.min.css" rel="stylesheet">
    <link href="http://cdn.get3w.com/assets/css/csstoolkits/0.0.1/ct.min.css" rel="stylesheet">
    <link href="` + section.Name + `.css" rel="stylesheet">
</head>
<body>
<section class="this">
    ` + section.HTML + `
</section>
<script src="` + section.Name + `.js"></script>
</body>
</html>`
	site.Write(site.GetSectionPreviewHTMLKey(section.Name), previewHTML)
}

// ChangeAppName change the name of app
func (site *Site) ChangeAppName(newName string) {
	if site.Rename != nil && site.Name != newName {
		config := site.GetConfig()
		config.Name = newName
		site.WriteConfig(config)

		site.Rename(newName, true)
	}
}

// GetPage get page models by pageName
func (site *Site) GetPage(pageName string) *get3w.Page {
	pageKey := site.GetPageKey(pageName)
	page := &get3w.Page{}
	pageData, err := site.Read(pageKey)
	if err == nil {
		page.Load(pageData)
	}

	page.Name = pageName
	return page
}

// DeletePage delete page file
func (site *Site) DeletePage(pageName string) {
	site.Delete(site.GetPageKey(pageName))
}

// DeleteSection delete section files
func (site *Site) DeleteSection(sectionName string) {
	site.Delete(site.GetSectionHTMLKey(sectionName))
	site.Delete(site.GetSectionCSSKey(sectionName))
	site.Delete(site.GetSectionJSKey(sectionName))
	site.Delete(site.GetSectionPreviewHTMLKey(sectionName))
	site.Delete(site.GetSectionPreviewPNGKey(sectionName))
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
	site.Write(key, content)
}

// NewFolder create folder
func (site *Site) NewFolder(key string) {
	key = site.GetKey(key)
	key = strings.Trim(strings.TrimSpace(key), "/") + "/"
	site.Write(key, "")
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
func (site *Site) Build(app *get3w.App) {
	config := site.GetConfig()
	for _, pageName := range config.Pages {
		page := site.GetPage(pageName)
		site.generatePage(page, config, app)
	}
}

func (site *Site) getPageHead(page *get3w.Page, config *get3w.Config, app *get3w.App) string {
	var buffer bytes.Buffer
	resourceURL := "http://cdn.get3w.com"

	title := page.Title
	if title == "" {
		title = config.Title
	}
	if title == "" && app != nil {
		title = app.Name
	}

	keywords := page.Keywords
	if keywords == "" {
		keywords = config.Keywords
	}
	if keywords == "" && app != nil {
		keywords = app.Tags
	}

	description := page.Description
	if description == "" {
		description = config.Description
	}
	if description == "" && app != nil {
		description = app.Description
	}

	buffer.WriteString(`<meta charset="utf-8">
`)
	buffer.WriteString(`<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
`)
	buffer.WriteString(`<meta name="viewport" content="width=device-width, initial-scale=1">
`)
	if len(keywords) > 0 {
		buffer.WriteString(fmt.Sprintf(`<meta name="keywords" content="%s"/>
`, keywords))
	}
	if len(description) > 0 {
		buffer.WriteString(fmt.Sprintf(`<meta name="description" content="%s"/>
`, description))
	}
	buffer.WriteString(fmt.Sprintf(`<title>%s</title>
`, title))
	buffer.WriteString(fmt.Sprintf(`<link href="%s/assets/css/font-awesome/4.4.0/css/font-awesome.min.css" rel="stylesheet">
`, resourceURL))
	buffer.WriteString(fmt.Sprintf(`<link href="%s/assets/css/animate.css/3.4.0/animate.min.css" rel="stylesheet">
`, resourceURL))
	buffer.WriteString(fmt.Sprintf(`<link href="%s/assets/css/csstoolkits/0.0.1/ct.min.css" rel="stylesheet">
`, resourceURL))

	return buffer.String()
}

func (site *Site) getPageBody(page *get3w.Page, config *get3w.Config) string {
	var buffer bytes.Buffer

	for _, sectionName := range page.Sections {
		if stringutils.Contains(config.Sections, sectionName) {
			section := &get3w.Section{
				ID:   stringutils.Base64ForURLEncode(sectionName),
				Name: sectionName,
				HTML: site.ReadSectionHTML(sectionName),
				CSS:  site.ReadSectionCSS(sectionName),
				JS:   site.ReadSectionJS(sectionName),
			}

			if len(section.CSS) > 0 {
				buffer.WriteString(fmt.Sprintf(`<style>
%s
</style>
`, strings.Replace(section.CSS, ".this", "#"+section.ID, -1)))
			}
			if len(section.HTML) > 0 {
				buffer.WriteString(fmt.Sprintf(`<section id="%s">
%s
</section>
`, section.ID, section.HTML))
			}
			if len(section.JS) > 0 {
				buffer.WriteString(fmt.Sprintf(`<script>
%s
</script>
`, section.JS))
			}
		}
	}

	return buffer.String()
}

func (site *Site) generatePage(page *get3w.Page, config *get3w.Config, app *get3w.App) {
	if page == nil || page.Sections == nil || len(page.Sections) == 0 {
		return
	}

	parsedContent := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
%s</head>
<body>
%s</body>
</html>`, site.getPageHead(page, config, app), site.getPageBody(page, config))

	url := page.URL
	if url == "" {
		if page.Type == get3w.PageHomepage {
			url = "index.html"
		} else {
			url = page.Name + ".html"
		}
	}

	key := site.GetKey(url)
	site.Write(key, parsedContent)
}
