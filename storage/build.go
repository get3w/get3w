package storage

import (
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/parser"
	"github.com/get3w/get3w/pkg/stringutils"
	"github.com/get3w/get3w/repos"
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

	err = site.DeleteFolder(site.GetSourcePrefix(repos.PrefixWWWRoot))
	if err != nil {
		return err
	}

	err = site.buildCopy(config, pages)
	if err != nil {
		return err
	}

	err = site.buildPages(config, pages, sections)
	if err != nil {
		return err
	}

	return nil
}

func (site *Site) getExcludeKeys(pages []*get3w.Page) []string {
	excludeKeys := []string{}
	for _, page := range pages {
		excludeKeys = append(excludeKeys, site.GetSourceKey(page.TemplateURL))
		if len(page.Children) > 0 {
			childKeys := site.getExcludeKeys(page.Children)
			for _, childKey := range childKeys {
				excludeKeys = append(excludeKeys, childKey)
			}
		}
	}
	return excludeKeys
}

func (site *Site) buildCopy(config *get3w.Config, pages []*get3w.Page) error {
	excludeKeys := []string{
		site.GetSourceKey("_"),
		site.GetSourceKey(repos.KeyConfig),
		site.GetSourceKey(repos.KeyReadme),
		site.GetSourceKey(repos.KeySummary),
		site.GetSourceKey(repos.KeyGitIgnore),
		site.GetSourceKey(repos.KeyLicense),
	}

	for _, excludeKey := range site.getExcludeKeys(pages) {
		excludeKeys = append(excludeKeys, excludeKey)
	}

	files, err := site.GetAllFiles(site.GetSourcePrefix(""))
	if err != nil {
		return err
	}

	for _, file := range files {
		if file.IsDir {
			continue
		}
		sourceKey := site.GetSourceKey(file.Path)
		if !stringutils.HasPrefixIgnoreCase(excludeKeys, sourceKey) {
			destinationKey := site.GetDestinationKey(file.Path)
			err := site.CopyToDestination(sourceKey, destinationKey)
			if err != nil {
				return err
			}
		}
	}

	return nil
}

func (site *Site) buildPages(config *get3w.Config, pages []*get3w.Page, sections map[string]*get3w.Section) error {
	for _, page := range pages {
		contents, _ := site.GetContents(page.ContentName)
		parsedContent := parser.ParsePage(site.Path, config, page, sections, contents)
		err := site.WriteDestination(site.GetDestinationKey(page.PageURL), []byte(parsedContent))
		if err != nil {
			return err
		}

		if len(page.Children) > 0 {
			site.buildPages(config, page.Children, sections)
		}
	}
	return nil
}
