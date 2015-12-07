package storage

import (
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/parser"
	"github.com/get3w/get3w/pkg/stringutils"
)

// Build all pages in the app.
func (site *Site) Build() error {
	config, err := site.GetConfig()
	if err != nil {
		return err
	}

	pages, err := site.GetPages()
	if err != nil {
		return err
	}

	sections, err := site.GetSections()
	if err != nil {
		return err
	}

	return site.buildPages(config, pages, sections)
}

func (site *Site) buildPages(config *get3w.Config, pages []*get3w.Page, sections map[string]*get3w.Section) error {
	for _, page := range pages {
		parsedContent := parser.ParsePage(config, page, sections)
		key := site.GetSourceKey(page.PageURL)
		err := site.WriteDestination(key, []byte(parsedContent))
		if err != nil {
			return err
		}

		if len(page.Children) > 0 {
			site.buildPages(config, page.Children, sections)
		}
	}
	return nil
}

func (site *Site) buildCopy(config *get3w.Config, pages []*get3w.Page) error {
	excludeKeys := []string{
		"_sections",
		"_wwwroot",
		".get3w.yml",
		".gitignore",
		"license",
		"readme.md",
		"summary.md",
	}

	for _, page := range pages {
		key := site.GetSourceKey(strings.ToLower(page.TemplateURL))
		excludeKeys = append(excludeKeys, key)
	}

	files, _ := site.GetAllFiles()
	for _, file := range files {
		sourceKey := site.GetSourceKey(file.Path)
		if !stringutils.Contains(excludeKeys, strings.ToLower(sourceKey)) {
			// destinationKey := ""
			// site.Copy(sourceKey, destinationKey)
		}
	}

	return nil
}
