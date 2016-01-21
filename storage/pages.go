package storage

import (
	"fmt"
	"math"

	"github.com/fatih/structs"
	"github.com/get3w/get3w"
	"github.com/get3w/get3w/pkg/fmatter"
	"gopkg.in/yaml.v2"
)

// LoadSitePages load pages for current site
func (parser *Parser) LoadSitePages() {
	pages := []*get3w.Page{}

	for _, summary := range parser.Current.PageSummaries {
		page := parser.getPage(summary)
		pages = append(pages, page)
	}

	parser.Current.Pages = pages
}

func (parser *Parser) getPage(summary *get3w.PageSummary) *get3w.Page {
	page := &get3w.Page{}

	data, _ := parser.Storage.Read(parser.key(summary.Path))

	front, content := fmatter.ReadRaw(data)
	if len(front) > 0 {
		yaml.Unmarshal(front, page)
	}

	ext := getExt(summary.Path)
	page.Content = getStringByExt(ext, content)

	page.Name = summary.Name
	page.Path = summary.Path
	if page.URL == "" {
		page.URL = summary.URL
	}
	page.Posts = parser.GetPosts(page.PostPath)

	if len(summary.Children) > 0 {
		for _, child := range summary.Children {
			childPage := parser.getPage(child)
			page.Children = append(page.Children, childPage)
		}
	}

	vars := make(map[string]interface{})
	if len(front) > 0 {
		yaml.Unmarshal(front, vars)
	}
	page.AllParameters = structs.Map(page)
	for key, val := range vars {
		if _, ok := page.AllParameters[key]; !ok {
			page.AllParameters[key] = val
		}
	}

	return page
}

func getPaginatorPath(page int, url string) string {
	if page == 1 {
		return url
	}
	return fmt.Sprintf("%s%d%s", removeExt(url), page, getExt(url))
}

func (parser *Parser) getPagePaginators(page *get3w.Page) []*get3w.Paginator {
	paginators := []*get3w.Paginator{}
	perPage := page.Paginate
	totalPosts := len(page.Posts)
	if perPage <= 0 || perPage >= totalPosts {
		paginator := &get3w.Paginator{
			Page:             1,
			PerPage:          perPage,
			Posts:            page.Posts,
			TotalPosts:       totalPosts,
			TotalPages:       1,
			PreviousPage:     0,
			PreviousPagePath: "",
			NextPage:         0,
			NextPagePath:     "",
			Path:             page.URL,
		}
		paginators = append(paginators, paginator)
	} else {
		totalPages := int(math.Ceil(float64(totalPosts) / float64(perPage)))
		for i := 1; i <= totalPages; i++ {
			previousPage := i - 1
			if previousPage < 0 {
				previousPage = 0
			}
			nextPage := i + 1
			if nextPage > totalPages {
				nextPage = 0
			}
			paginator := &get3w.Paginator{
				Page:             i,
				PerPage:          perPage,
				Posts:            page.Posts[perPage*(i-1) : perPage*i],
				TotalPosts:       totalPosts,
				TotalPages:       totalPages,
				PreviousPage:     previousPage,
				PreviousPagePath: getPaginatorPath(previousPage, page.URL),
				NextPage:         nextPage,
				NextPagePath:     getPaginatorPath(nextPage, page.URL),
				Path:             getPaginatorPath(i, page.URL),
			}
			paginators = append(paginators, paginator)
		}
	}
	return paginators
}

// WritePage write content to page file
func (parser *Parser) WritePage(page *get3w.Page) error {
	data, err := fmatter.Write(page, []byte(page.Content))
	if err != nil {
		return err
	}
	return parser.Storage.Write(parser.key(page.Path), data)
}

// DeletePage delete page file
func (parser *Parser) DeletePage(summary *get3w.PageSummary) error {
	return parser.Storage.Delete(parser.key(summary.Path))
}
