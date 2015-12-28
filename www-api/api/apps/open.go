package apps

import (
	"net/http"
	"time"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/timeutils"
	"github.com/get3w/get3w/storage"
	"github.com/get3w/get3w/www-api/api"

	"github.com/labstack/echo"
)

// Open app, local api only
func Open(c *echo.Context) error {
	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}
	owner := api.Owner(c)

	input := &get3w.AppOpenInput{}
	err := api.LoadRequestInput(c, input)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}

	parser, err := storage.NewLocalParser(input.Path)

	if err != nil {
		return api.ErrorBadRequest(c, err)
	}

	app := &get3w.App{
		Owner:       owner,
		Name:        parser.Name,
		Description: parser.Config.Description,
		Tags:        "",
		Private:     false,
		CreatedAt:   timeutils.ToString(time.Now()),
		UpdatedAt:   timeutils.ToString(time.Now()),
	}

	return c.JSON(http.StatusOK, app)
}
