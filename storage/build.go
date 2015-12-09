package storage

import (
	"fmt"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/parser"
	"github.com/get3w/get3w/pkg/stringutils"
	"github.com/get3w/get3w/repos"
)

// Build all pages in the app.
func (site *Site) Build() error {
	pages := site.GetPages()
	sections := site.GetSections()
	destinationPrefix := site.GetSourcePrefix(repos.PrefixDestination)

	err := site.DeleteFolder(destinationPrefix)
	if err != nil {
		return err
	}
	err = site.NewFolder(destinationPrefix)
	if err != nil {
		return err
	}

	err = site.buildCopy(pages)
	if err != nil {
		return err
	}

	err = site.buildPages(pages, sections)
	if err != nil {
		return err
	}

	return nil
}

func (site *Site) getExcludeKeys(pages []*get3w.Page) []string {
	excludeKeys := []string{}
	for _, page := range pages {
		if page.Path != "" {
			excludeKeys = append(excludeKeys, site.GetSourceKey(page.Path))
		}
		if page.Layout != "" {
			excludeKeys = append(excludeKeys, site.GetSourceKey(page.Layout))
		}
		if page.ContentLayout != "" {
			excludeKeys = append(excludeKeys, site.GetSourceKey(page.ContentLayout))
		}
		if page.ContentFolder != "" {
			excludeKeys = append(excludeKeys, site.GetSourceKey(page.ContentFolder))
		}
		if len(page.Children) > 0 {
			childKeys := site.getExcludeKeys(page.Children)
			for _, childKey := range childKeys {
				excludeKeys = append(excludeKeys, childKey)
			}
		}
	}
	return excludeKeys
}

func (site *Site) buildCopy(pages []*get3w.Page) error {
	excludeKeys := []string{
		site.GetSourceKey("_"),
		site.GetSourceKey(repos.KeyConfig),
		site.GetSourceKey(repos.KeyReadme),
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
			fmt.Println(destinationKey)
			err := site.CopyToDestination(sourceKey, destinationKey)
			if err != nil {
				return err
			}
		}
	}

	return nil
}

func (site *Site) buildPages(pages []*get3w.Page, sections map[string]*get3w.Section) error {
	for _, page := range pages {
		contents, _ := site.GetContents(page)
		parsedContent := parser.ParsePage(site.Path, site.Config, page, sections, contents)
		if len(contents) > 0 {
			for _, content := range contents {
				site.buildContent(page, content)
			}
		}
		err := site.WriteDestination(site.GetDestinationKey(page.URL), []byte(parsedContent))
		if err != nil {
			return err
		}

		if len(page.Children) > 0 {
			site.buildPages(page.Children, sections)
		}
	}
	return nil
}

func (site *Site) buildContent(page *get3w.Page, content map[string]string) error {
	parsedContent := parser.ParseContent(site.Path, site.Config, page, content)
	pageURL := page.ContentURL
	for key, value := range content {
		pageURL = strings.Replace(pageURL, ":"+key, value, -1)
	}

	err := site.WriteDestination(site.GetDestinationKey(pageURL), []byte(parsedContent))
	if err != nil {
		return err
	}

	return nil
}
