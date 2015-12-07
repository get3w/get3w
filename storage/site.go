package storage

import (
	"path/filepath"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/parser"
	"github.com/get3w/get3w/pkg/stringutils"
)

// system file name
const (
	KeyConfig  = ".get3w.yml"
	KeyReadme  = "README.md"
	KeySummary = "SUMMARY.md"
)

// Site contains attributes and operations of the app
type Site struct {
	Name              string
	Path              string
	GetSourceKey      func(url ...string) string
	GetDestinationKey func(url ...string) string
	Read              func(key string) (string, error)
	Checksum          func(key string) (string, error)
	Write             func(key string, bs []byte) error
	WriteDestination  func(key string, bs []byte) error
	Download          func(key string, downloadURL string) error
	Rename            func(owner, newName string, deleteAll bool) error
	// Copy                 func(sourceKey string, destinationKey string) error
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

// GetConfigKey get CONFIG.yml file key
func (site *Site) GetConfigKey() string {
	return site.GetSourceKey(KeyConfig)
}

// GetSummaryKey get SUMMARY.md file key
func (site *Site) GetSummaryKey() string {
	return site.GetSourceKey(KeySummary)
}

// GetSectionKey get html file key by sectionName
func (site *Site) GetSectionKey(relatedURL string) string {
	return site.GetSourceKey("_sections", relatedURL)
}

// GetConfig get config file content
func (site *Site) GetConfig() (*get3w.Config, error) {
	if site.config == nil {
		config := &get3w.Config{}
		configData, err := site.Read(site.GetConfigKey())
		if err != nil {
			return nil, err
		}

		err = parser.LoadConfig(config, configData)
		if err != nil {
			return nil, err
		}

		site.config = config
	}

	return site.config, nil
}

// GetPageSummaries get SUMMARY.md file content
func (site *Site) GetPageSummaries() ([]*get3w.PageSummary, error) {
	if site.pageSummaries == nil {
		summaries := []*get3w.PageSummary{}

		data, err := site.Read(site.GetSummaryKey())
		if err != nil {
			return nil, err
		}

		summaries = parser.UnmarshalSummary(data)

		site.pageSummaries = summaries
	}

	return site.pageSummaries, nil
}

// GetPages parse SUMMARY.md file and returns pages
func (site *Site) GetPages() ([]*get3w.Page, error) {
	if site.pages == nil {
		pages := []*get3w.Page{}

		summaries, err := site.GetPageSummaries()
		if err != nil {
			return nil, err
		}

		for _, summary := range summaries {
			page := site.getPageBySummary(summary)
			pages = append(pages, page)
		}

		site.pages = pages
	}

	return site.pages, nil
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
func (site *Site) GetSections() (map[string]*get3w.Section, error) {
	if site.sections == nil {
		sections := make(map[string]*get3w.Section)
		files, err := site.GetFiles(site.GetSectionKey(""))
		if err != nil {
			return nil, err
		}

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
				section.HTML, _ = site.ReadSectionContent(file)

			} else if ext == parser.ExtCSS {
				section.CSS, _ = site.ReadSectionContent(file)
			} else if ext == parser.ExtJS {
				section.JS, _ = site.ReadSectionContent(file)
			}

			sections[sectionName] = section
		}

		site.sections = sections
	}

	return site.sections, nil
}

// ReadSectionContent get section file content
func (site *Site) ReadSectionContent(file *get3w.File) (string, error) {
	keyName := site.GetSectionKey(file.Name)
	str, err := site.Read(keyName)
	if err != nil {
		return "", err
	}

	return str, nil
}

// WriteConfig write content to config file
func (site *Site) WriteConfig(config *get3w.Config) error {
	configKey := site.GetConfigKey()
	yaml, err := config.String()
	if err != nil {
		return err
	}

	return site.Write(configKey, []byte(yaml))
}

// WritePage write content to page file
func (site *Site) WritePage(page *get3w.Page) error {
	pageKey := site.GetSourceKey(page.TemplateURL)
	yaml, err := page.String()
	if err != nil {
		return err
	}
	return site.Write(pageKey, []byte(yaml))
}

// SaveSection write content to section
func (site *Site) SaveSection(section *get3w.Section) error {
	if err := site.Write(site.GetSectionKey(section.Name+parser.ExtHTML), []byte(section.HTML)); err != nil {
		return err
	}
	if err := site.Write(site.GetSectionKey(section.Name+parser.ExtCSS), []byte(section.CSS)); err != nil {
		return err
	}
	if err := site.Write(site.GetSectionKey(section.Name+parser.ExtJS), []byte(section.JS)); err != nil {
		return err
	}
	return nil
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
func (site *Site) ChangeAppName(owner, newName string) error {
	if site.Name != newName {
		return site.Rename(owner, newName, true)
	}
	return nil
}

// GetPage get page models by pageName
func (site *Site) GetPage(summary *get3w.PageSummary) *get3w.Page {
	data := ""
	if parser.IsExt(summary.TemplateURL) {
		pageKey := site.GetSourceKey(summary.TemplateURL)
		data, _ = site.Read(pageKey)
	}

	return parser.UnmarshalPage(summary, data)
}

// DeletePage delete page file
func (site *Site) DeletePage(summary *get3w.PageSummary) error {
	return site.Delete(site.GetSourceKey(summary.TemplateURL))
}

// DeleteSection delete section files
func (site *Site) DeleteSection(sectionName string) error {
	if err := site.Delete(site.GetSectionKey(sectionName + parser.ExtHTML)); err != nil {
		return err
	}
	if err := site.Delete(site.GetSectionKey(sectionName + parser.ExtCSS)); err != nil {
		return err
	}
	if err := site.Delete(site.GetSectionKey(sectionName + parser.ExtJS)); err != nil {
		return err
	}
	return nil
}

// NewFolder create folder
func (site *Site) NewFolder(key string) error {
	key = site.GetSourceKey(key)
	key = strings.Trim(strings.TrimSpace(key), "/") + "/"
	return site.Write(key, []byte(""))
}

// DeleteFile delete file
func (site *Site) DeleteFile(key string) error {
	key = site.GetSourceKey(key)
	return site.Delete(key)
}

// DeleteFolder delete folder
func (site *Site) DeleteFolder(key string) error {
	key = site.GetSourceKey(key)
	key = strings.Trim(strings.TrimSpace(key), "/") + "/"
	return site.Delete(key)
}
